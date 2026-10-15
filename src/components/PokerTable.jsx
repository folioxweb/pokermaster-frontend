import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  VolumeX,
  ArrowLeft,
  Copy,
  Check,
  Play,
  UserPlus,
  RefreshCw,
  Users,
  Sun,
  Moon,
  Trophy,
  Crown,
  Settings,
  Eye,
  Clock,
  Coins,
  ChevronDown,
  Share2,
  Link,
  UserX,
  Mail,
  MoreVertical,
  Palette,
  LogOut
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getSeatCoordinates } from '../lib/seatingMath';
import { evaluateHand, compareScores } from '../lib/pokerEvaluator';
import { formatPoints, formatPointsOnly, formatCurrencyOnly } from '../lib/formatters';
import {
  playCardDeal,
  playChipClink,
  playCheckKnock,
  playFold,
  playTimerAlert,
  playWinCelebration,
  toggleSound,
  isSoundEnabled
} from '../lib/soundEffects';
import {
  generateSeatKeyPair,
  sealHoleCards,
  unsealHoleCards,
  sanitizePlayersForBroadcast,
  sanitizeHandStateForBroadcast
} from '../lib/pokerSecurity';
import { PlayerSeat } from './PlayerSeat';
import { CommunityArea } from './CommunityArea';
import { PlayerHUD } from './PlayerHUD';
import { PokerChipSVG } from './ChipStack';

const BOT_NAMES = ['Viper', 'AceHigh', 'BluffKing', 'Maverick', 'ChipLeader', 'LadyLuck', 'RiverRat'];

// Standard 52-card deck generator
const generateDeck = () => {
  const suits = ['s', 'h', 'd', 'c'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const s of suits) {
    for (const r of ranks) {
      deck.push(`${r}${s}`);
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

// Resilient Card Drawer: Guarantees exact count of valid cards without returning undefined, null, or duplicates
const drawCardsFromDeck = (neededCount, currentDeck = [], usedCards = []) => {
  const deck = [...(currentDeck || [])];
  const drawn = [];
  const usedSet = new Set((usedCards || []).filter(c => typeof c === 'string' && c.length >= 2));

  while (drawn.length < neededCount) {
    if (deck.length > 0) {
      const card = deck.shift();
      if (card && typeof card === 'string' && card.length >= 2 && !usedSet.has(card)) {
        drawn.push(card);
        usedSet.add(card);
      }
    } else {
      const freshDeck = generateDeck();
      for (const card of freshDeck) {
        if (!usedSet.has(card)) {
          deck.push(card);
        }
      }
      if (deck.length === 0) break;
    }
  }

  return { drawn, remainingDeck: deck };
};

// Auto-Heal Community Cards: Ensures no street ever has missing/null/empty cards
const healCommunityCards = (handState, currentPlayers = [], dealerSecretCards = {}) => {
  if (!handState || !['flop', 'turn', 'river', 'showdown', 'ended'].includes(handState.phase)) {
    return handState?.communityCards || [];
  }
  const reqCount = handState.phase === 'flop' ? 3 : handState.phase === 'turn' ? 4 : 5;
  const valid = (handState.communityCards || []).filter(c => typeof c === 'string' && c.length >= 2);
  if (valid.length < reqCount) {
    const allUsed = [
      ...valid,
      ...(currentPlayers || []).flatMap(p => p.cards || []),
      ...Object.values(dealerSecretCards || {}).flat()
    ];
    const { drawn } = drawCardsFromDeck(reqCount - valid.length, [], allUsed);
    return [...valid, ...drawn];
  }
  return valid;
};

export const PokerTable = ({
  gameRoom,
  user,
  onLeaveTable,
  onOpenSocial = null,
  onlineCount = 1,
  theme = 'dark',
  onToggleTheme = null
}) => {
  const [feltTheme, setFeltTheme] = useState('emerald');
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [copiedCode, setCopiedCode] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Identify Hero seat (dynamically matches logged-in user handle)
  const [mySeatIndex, setMySeatIndex] = useState(0);

  // Players seated at table
  const [players, setPlayers] = useState([]);

  // Game Hand State
  const [handState, setHandState] = useState({
    handNumber: 0,
    phase: 'waiting', // 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended'
    communityCards: [],
    deck: [],
    currentTurnSeat: 0,
    dealerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    currentBet: 0,
    minRaise: gameRoom?.bigBlind ?? 4,
    mainPot: 0,
    sidePots: [],
    winners: []
  });

  // Waiting Room Settings (Editable by ANY player before match begins)
  const [tableSettings, setTableSettings] = useState({
    smallBlind: gameRoom?.smallBlind ?? 2,
    bigBlind: gameRoom?.bigBlind ?? 4,
    startingStack: gameRoom?.startingStack || 1000,
    turnTime: gameRoom?.turnTime !== undefined && gameRoom?.turnTime !== null ? gameRoom.turnTime : 0,
    blindsFrequency: gameRoom?.blindsFrequency || 'fast_5'
  });

  const turnMaxTime = tableSettings.turnTime !== undefined && tableSettings.turnTime !== null
    ? tableSettings.turnTime
    : (gameRoom?.turnTime !== undefined && gameRoom?.turnTime !== null ? gameRoom.turnTime : 0);

  const [turnTimeLeft, setTurnTimeLeft] = useState(turnMaxTime);
  const [winningCards, setWinningCards] = useState([]);
  const [announcement, setAnnouncement] = useState('Waiting for host to start hand');
  const [flyingChips, setFlyingChips] = useState([]);
  const [isPotPulsing, setIsPotPulsing] = useState(false);
  const [heroShowCardsClicked, setHeroShowCardsClicked] = useState(false);

  // Match Over / Tournament Champion & Auto-Redirect State
  const [matchChampion, setMatchChampion] = useState(null);
  const [lobbyRedirectCountdown, setLobbyRedirectCountdown] = useState(null);

  const [isWaitingLobbyMinimized, setIsWaitingLobbyMinimized] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  // Check if current user is the room creator / host
  const isCreator = (gameRoom?.host_username || gameRoom?.hostUsername) === user?.username || Boolean(gameRoom?.isHost);

  const channelRef = useRef(null);
  const turnTimerRef = useRef(null);
  const activeRoomIdRef = useRef(null);
  const playersRef = useRef(players);
  const handStateRef = useRef(handState);
  const mySeatIndexRef = useRef(mySeatIndex);
  const announcementRef = useRef(announcement);

  // ZERO-KNOWLEDGE POKER SECURITY REFS
  // Cryptographic keys and private unmasked cards are isolated in browser memory refs.
  // Opponents' cards and the undealt deck NEVER enter React state, props, DOM or broadcast.
  const securityKeysRef = useRef(null);
  const myDecryptedCardsRef = useRef([]);
  const dealerSecretCardsRef = useRef({});
  const dealerDeckRef = useRef([]);

  // Generate hardware-accelerated 2048-bit RSA-OAEP keypair for player seat
  useEffect(() => {
    let active = true;
    generateSeatKeyPair().then((keys) => {
      if (active && keys) {
        securityKeysRef.current = keys;
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    handStateRef.current = handState;
  }, [handState]);

  useEffect(() => {
    mySeatIndexRef.current = mySeatIndex;
  }, [mySeatIndex]);

  useEffect(() => {
    announcementRef.current = announcement;
  }, [announcement]);

  // Close 3-dots dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Automatic lobby redirect effect on match completion
  useEffect(() => {
    if (lobbyRedirectCountdown === null) return;
    if (lobbyRedirectCountdown <= 0) {
      onLeaveTable();
      return;
    }
    const timer = setTimeout(() => {
      setLobbyRedirectCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearTimeout(timer);
  }, [lobbyRedirectCountdown, onLeaveTable]);

  // Initialize Seated Players & Supabase Realtime Channel
  useEffect(() => {
    let isMounted = true;
    const totalMax = Math.max(3, Math.min(8, gameRoom?.maxPlayers || 6));

    const initTable = async () => {
      // 1. Solo Practice Mode with Bots
      if (gameRoom?.isPractice) {
        let initialList = [
          {
            seat_index: 0,
            user_id: user?.id,
            username: user?.username || 'Hero',
            chips: gameRoom?.startingStack || 1000,
            current_round_bet: 0,
            total_hand_bet: 0,
            status: 'active',
            last_action: null,
            cards: [],
            shownCards: true,
            isBot: false
          }
        ];
        for (let i = 1; i < totalMax; i++) {
          initialList.push({
            seat_index: i,
            username: BOT_NAMES[i - 1] || `Bot ${i + 1}`,
            chips: gameRoom?.startingStack || 1000,
            current_round_bet: 0,
            total_hand_bet: 0,
            status: 'active',
            last_action: null,
            cards: [],
            shownCards: false,
            isBot: true
          });
        }
        if (isMounted) {
          setMySeatIndex(0);
          setPlayers(initialList);
          setAnnouncement(`Practice Mode (${totalMax} Players) • Ready to play`);
        }
        return;
      }

      // 2. Live Multiplayer Mode: Resolve Room UUID
      let rid = gameRoom?.roomId;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!rid || !uuidPattern.test(rid)) {
        try {
          const { data: found } = await supabase
            .from('poker_rooms')
            .select('id')
            .eq('code', gameRoom?.roomCode)
            .maybeSingle();
          if (found?.id) rid = found.id;
        } catch (err) {
          console.warn('Error resolving room UUID:', err);
        }
      }
      activeRoomIdRef.current = rid;

      // 3. Query existing players already seated at table
      let existingSeated = [];
      if (rid) {
        try {
          const { data: seatedDb } = await supabase
            .from('poker_room_players')
            .select('*')
            .eq('room_id', rid);
          if (seatedDb) existingSeated = seatedDb;
        } catch (err) {
          console.warn('Error querying seated players:', err);
        }
      }

      // 4. Assign seat for current user (auto-fill first available seat)
      let assignedSeat = 0;
      const myExisting = existingSeated.find(p => p.username === user.username);
      if (myExisting) {
        assignedSeat = myExisting.seat_index;
      } else {
        const occupied = existingSeated.map(p => p.seat_index);
        while (occupied.includes(assignedSeat) && assignedSeat < totalMax) {
          assignedSeat++;
        }
      }

      if (isMounted) {
        setMySeatIndex(assignedSeat);
      }

      // 5. Upsert current user into database poker_room_players
      if (rid) {
        try {
          // Delete any existing seat for this user in this room first to guarantee no duplicate seats
          await supabase
            .from('poker_room_players')
            .delete()
            .eq('room_id', rid)
            .eq('username', user.username);

          await supabase.from('poker_room_players').upsert({
            room_id: rid,
            user_id: user.id || null,
            username: user.username,
            seat_index: assignedSeat,
            chips: myExisting?.chips || gameRoom.startingStack || 1000,
            current_round_bet: 0,
            total_hand_bet: 0,
            status: 'active',
            is_connected: true
          }, { onConflict: 'room_id,seat_index' });
        } catch (err) {
          console.warn('Error inserting into poker_room_players:', err);
        }
      }

      // 6. Build combined players list with cryptographic public keys
      if (!securityKeysRef.current) {
        securityKeysRef.current = await generateSeatKeyPair();
      }

      const heroPlayer = {
        seat_index: assignedSeat,
        user_id: user.id,
        username: user.username,
        chips: myExisting?.chips || gameRoom.startingStack || 1000,
        current_round_bet: 0,
        total_hand_bet: 0,
        status: 'active',
        last_action: null,
        cards: [],
        publicKey: securityKeysRef.current?.publicKey || null,
        shownCards: false,
        isBot: false
      };

      let tablePlayers = [heroPlayer];
      for (const p of existingSeated) {
        if (p.seat_index !== assignedSeat) {
          tablePlayers.push({
            seat_index: p.seat_index,
            user_id: p.user_id,
            username: p.username,
            chips: p.chips || gameRoom.startingStack || 1000,
            current_round_bet: p.current_round_bet || 0,
            total_hand_bet: p.total_hand_bet || 0,
            status: p.status || 'active',
            last_action: p.last_action || null,
            cards: [],
            publicKey: p.publicKey || null,
            shownCards: false,
            isBot: false
          });
        }
      }

      if (isMounted) {
        setPlayers(tablePlayers);
        setAnnouncement(`Live Room ${gameRoom?.roomCode} • ${tablePlayers.length} player(s) seated`);
      }

      // 7. Subscribe to Supabase Realtime Channel
      const roomCode = gameRoom?.roomCode || 'SOLO';
      const channel = supabase.channel(`poker_room_${roomCode}`, {
        config: {
          broadcast: { self: false },
          presence: { key: user.username }
        }
      });

      channel
        .on('broadcast', { event: 'PLAYER_JOINED' }, ({ payload }) => {
          setPlayers((prev) => {
            if (prev.some(p => p.seat_index === payload.seat_index || p.username === payload.username)) {
              return prev.map(p => p.username === payload.username ? { ...p, ...payload, cards: p.seat_index === mySeatIndexRef.current ? p.cards : [] } : p);
            }
            return [...prev, { ...payload, cards: [], shownCards: false }];
          });
          setAnnouncement(`👤 ${payload.username} joined the table!`);
          // Reply with current table state sync (STRICTLY SANITIZED - ZERO LEAKS)
          channel.send({
            type: 'broadcast',
            event: 'SYNC_RESPONSE',
            payload: {
              players: sanitizePlayersForBroadcast(playersRef.current, mySeatIndexRef.current, handStateRef.current.phase === 'showdown'),
              handState: sanitizeHandStateForBroadcast(handStateRef.current)
            }
          });
        })
        .on('broadcast', { event: 'SYNC_RESPONSE' }, ({ payload }) => {
          if (payload.players && payload.players.length > 0) {
            setPlayers((prev) => {
              const map = new Map(prev.map(p => [p.seat_index, p]));
              const mySeat = mySeatIndexRef.current;
              for (const p of payload.players) {
                if (p.seat_index !== mySeat) {
                  map.set(p.seat_index, {
                    ...p,
                    cards: [], // NEVER accept opponent hole cards into state from sync response
                    shownCards: p.shownCards || false
                  });
                }
              }
              return Array.from(map.values());
            });
          }
          if (payload.handState && payload.handState.phase !== 'waiting') {
            const safeHandState = sanitizeHandStateForBroadcast(payload.handState);
            safeHandState.communityCards = healCommunityCards(safeHandState, payload.players || [], dealerSecretCardsRef.current);
            setHandState(safeHandState);
          }
        })
        .on('broadcast', { event: 'SEAT_TAKEN' }, ({ payload }) => {
          setPlayers((prev) => {
            if (prev.some(p => p.seat_index === payload.seat_index)) {
              return prev.map(p => p.seat_index === payload.seat_index ? { ...p, ...payload, cards: p.seat_index === mySeatIndexRef.current ? p.cards : [] } : p);
            }
            return [...prev, { ...payload, cards: [] }];
          });
          setAnnouncement(`👤 ${payload.username} seated at Seat ${payload.seat_index + 1}`);
        })
        .on('broadcast', { event: 'PLAYER_LEFT' }, ({ payload }) => {
          setPlayers((prev) => prev.filter(p => p.username !== payload.username && p.seat_index !== payload.seat_index));
          setAnnouncement(`${payload.username} left the table`);

          // If the dealer host left during an active hand, finish hand gracefully
          if (handStateRef.current.dealerHostSeat === payload.seat_index && !['waiting', 'ended', 'showdown'].includes(handStateRef.current.phase)) {
            setHandState((prev) => ({
              ...prev,
              phase: 'ended',
              winners: []
            }));
            setAnnouncement(`Dealer (${payload.username}) disconnected. You can deal a new hand.`);
          }
        })
        .on('broadcast', { event: 'TABLE_STATE_SYNC' }, async ({ payload }) => {
          if (!payload || !payload.handState) return;

          // 1. Audio and visual feedback for action
          if (payload.actor) {
            if (payload.actor.action === 'fold') playFold();
            else if (payload.actor.action === 'check') playCheckKnock();
            else if (['call', 'bet', 'raise'].includes(payload.actor.action)) {
              playChipClink();
              triggerChipsFlight(payload.players);
            }
          }

          // 2. Audio for new community cards dealt
          if (payload.handState.phase !== handStateRef.current.phase && ['flop', 'turn', 'river'].includes(payload.handState.phase)) {
            playCardDeal();
            triggerChipsFlight(payload.players);
          }

          // 3. Audio & confetti for showdown or winner
          if (payload.handState.phase === 'showdown' || payload.handState.winners?.length > 0) {
            playWinCelebration();
            confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
          }

          // 4. Update announcements & winning cards
          if (payload.announcement) setAnnouncement(payload.announcement);
          if (payload.winningCards) setWinningCards(payload.winningCards);

          // 5. Update handState (strictly ensure undealt deck is empty and cards match phase)
          const safeHandState = sanitizeHandStateForBroadcast(payload.handState);
          safeHandState.communityCards = healCommunityCards(safeHandState, payload.players || [], dealerSecretCardsRef.current);
          setHandState(safeHandState);

          // 6. Zero-Knowledge Hole Cards Resolution
          const isShowdown = payload.handState.phase === 'showdown' || payload.handState.phase === 'ended';

          // If payload contains sealedCards for Hero, decrypt them using Hero's private key
          const incomingHero = payload.players?.find((p) => p.seat_index === mySeatIndexRef.current);
          if (incomingHero?.sealedCards && securityKeysRef.current?.keyPair?.privateKey) {
            const unsealed = await unsealHoleCards(incomingHero.sealedCards, securityKeysRef.current.keyPair.privateKey);
            if (unsealed && Array.isArray(unsealed) && unsealed.length >= 2) {
              myDecryptedCardsRef.current = unsealed;
            }
          }

          // Update React state players:
          // HERO: receives myDecryptedCardsRef.current
          // OPPONENTS: strictly receive cards: [] during active play.
          //            Only at showdown for shownCards: true do opponents have revealed cards.
          setPlayers((currentPlayers) => {
            return payload.players.map((incomingP) => {
              const isHeroSeat = incomingP.seat_index === mySeatIndexRef.current;
              if (isHeroSeat) {
                return {
                  ...incomingP,
                  cards: (myDecryptedCardsRef.current && myDecryptedCardsRef.current.length >= 2)
                    ? myDecryptedCardsRef.current
                    : (incomingP.cards || []),
                  shownCards: isShowdown ? Boolean(incomingP.shownCards) : false
                };
              }

              // Opponents: STRICTLY EMPTY ARRAY during active play.
              // Only reveal at showdown if shownCards is true!
              const opponentCards = (isShowdown && incomingP.shownCards && Array.isArray(incomingP.cards))
                ? incomingP.cards
                : [];

              return {
                ...incomingP,
                cards: opponentCards,
                shownCards: isShowdown ? Boolean(incomingP.shownCards) : false
              };
            });
          });
        })
        .on('broadcast', { event: 'PLAYER_ACTION' }, ({ payload }) => {
          if (!payload) return;
          // Only Dealer Host processes the turn logic and advances the table
          if (handStateRef.current.dealerHostSeat === mySeatIndexRef.current) {
            executeActionLogic(payload.action, payload.amount, payload.seatIndex);
          }
        })
        .on('broadcast', { event: 'PLAYER_SHOW_CARDS' }, ({ payload }) => {
          setPlayers((prev) =>
            prev.map((p) =>
              p.seat_index === payload.seatIndex
                ? { ...p, shownCards: true, cards: payload.cards || p.cards }
                : p
            )
          );
          setAnnouncement(`👁️ ${payload.username} revealed their cards!`);
        })
        .on('broadcast', { event: 'MATCH_OVER' }, ({ payload }) => {
          if (!payload?.winner) return;
          setMatchChampion(payload.winner);
          setAnnouncement(`🏆 MATCH OVER! ${payload.winner.username} is the CHAMPION!`);
          playWinCelebration();
          confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });
          setLobbyRedirectCountdown(5);
        })
        .on('broadcast', { event: 'TABLE_SETTINGS_SYNC' }, ({ payload }) => {
          if (payload?.settings) {
            setTableSettings(payload.settings);
            setAnnouncement(`⚙️ ${payload.updatedBy || 'Player'} updated table settings`);
          }
        })
        .on('broadcast', { event: 'PLAYER_REMOVED' }, ({ payload }) => {
          if (payload) {
            if (payload.username === user?.username || payload.seatIndex === mySeatIndexRef.current) {
              alert('You have been removed from the table by the room host.');
              onLeaveTable();
              return;
            }
            setPlayers((prev) => prev.filter((p) => p.seat_index !== payload.seatIndex));
            setAnnouncement(`🚪 ${payload.username} was removed from the table`);
          }
        });

      if (rid) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'poker_room_players', filter: `room_id=eq.${rid}` },
          async () => {
            const { data: refreshed } = await supabase
              .from('poker_room_players')
              .select('*')
              .eq('room_id', rid);
            if (refreshed && isMounted) {
              setPlayers((prev) => {
                const map = new Map(prev.map(p => [p.seat_index, p]));
                for (const rp of refreshed) {
                  if (rp.seat_index !== assignedSeat) {
                    const existing = map.get(rp.seat_index) || {};
                    map.set(rp.seat_index, {
                      ...existing,
                      seat_index: rp.seat_index,
                      user_id: rp.user_id,
                      username: rp.username,
                      chips: rp.chips,
                      status: rp.status,
                      isBot: false,
                      shownCards: existing.shownCards || false,
                      cards: existing.cards || []
                    });
                  }
                }
                return Array.from(map.values());
              });
            }
          }
        );
      }

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'PLAYER_JOINED',
            payload: heroPlayer
          });
          await channel.track({
            username: user.username,
            seat_index: assignedSeat
          });
        }
      });

      channelRef.current = channel;
    };

    initTable();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'PLAYER_LEFT',
          payload: { username: user?.username, seat_index: mySeatIndexRef.current }
        });
        supabase.removeChannel(channelRef.current);
      }
      if (activeRoomIdRef.current && !gameRoom?.isPractice) {
        supabase
          .from('poker_room_players')
          .delete()
          .eq('room_id', activeRoomIdRef.current)
          .eq('username', user?.username)
          .then(async () => {
            try {
              const { count } = await supabase
                .from('poker_room_players')
                .select('*', { count: 'exact', head: true })
                .eq('room_id', activeRoomIdRef.current);
              if (count === 0) {
                await supabase
                  .from('poker_rooms')
                  .update({ status: 'closed' })
                  .eq('id', activeRoomIdRef.current);
              }
            } catch (err) {
              console.warn('Error auto-closing empty table:', err);
            }
          });
      }
    };
  }, [gameRoom, user]);

  // Turn Countdown Timer
  useEffect(() => {
    if (handState.phase === 'waiting' || handState.phase === 'ended' || handState.phase === 'showdown') {
      return;
    }

    if (turnTimerRef.current) clearInterval(turnTimerRef.current);

    // If turnMaxTime <= 0, no time limit!
    if (!turnMaxTime || turnMaxTime <= 0) {
      setTurnTimeLeft(0);
      return;
    }

    setTurnTimeLeft(turnMaxTime);

    turnTimerRef.current = setInterval(() => {
      setTurnTimeLeft((prev) => {
        if (prev <= 4 && prev > 1) {
          playTimerAlert();
        }
        if (prev <= 1) {
          clearInterval(turnTimerRef.current);
          handleTurnTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(turnTimerRef.current);
  }, [handState.currentTurnSeat, handState.phase, turnMaxTime]);

  // AI Bot Turn Execution (in Practice mode or when testing with bots)
  useEffect(() => {
    if (handState.phase === 'waiting' || handState.phase === 'ended' || handState.phase === 'showdown') {
      return;
    }

    const activePlayer = players.find((p) => p.seat_index === handState.currentTurnSeat);
    if (!activePlayer || !activePlayer.isBot) {
      return;
    }

    // Only Dealer Host executes bot turns (guaranteeing single authoritative execution)
    const isDealerHost = handStateRef.current.dealerHostSeat === mySeatIndex || gameRoom?.isPractice;
    if (!isDealerHost) {
      return;
    }

    const timer = setTimeout(() => {
      executeBotTurn(activePlayer);
    }, 1800);

    return () => clearTimeout(timer);
  }, [handState.currentTurnSeat, handState.phase, players, mySeatIndex]);

  // User Takes an Open Seat (Live Multiplayer)
  const handleSitAtSeat = (seatIndex) => {
    if (players.some(p => p.username === user.username)) {
      alert('You are already seated at the table!');
      return;
    }

    const newSeated = {
      seat_index: seatIndex,
      user_id: user.id,
      username: user.username,
      chips: tableSettings.startingStack || gameRoom?.startingStack || 1000,
      current_round_bet: 0,
      total_hand_bet: 0,
      status: 'active',
      last_action: null,
      cards: [],
      publicKey: securityKeysRef.current?.publicKey || null,
      shownCards: false,
      isBot: false
    };

    setMySeatIndex(seatIndex);
    const updated = [...players, newSeated];
    setPlayers(updated);

    // Broadcast seat to other connected clients
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'SEAT_TAKEN',
        payload: newSeated
      });
    }
  };

  // Host Adds an AI Bot to a specific vacant seat
  const handleAddBotToSeat = (targetSeatIndex) => {
    const totalMax = Math.max(2, Math.min(8, gameRoom?.maxPlayers || 6));
    if (players.length >= totalMax) {
      alert('Table is full!');
      return;
    }
    if (players.some((p) => p.seat_index === targetSeatIndex)) {
      alert('Seat is already occupied!');
      return;
    }

    const existingNames = new Set(players.map((p) => p.username));
    const availableName = BOT_NAMES.find((n) => !existingNames.has(n)) || `Bot_${targetSeatIndex + 1}`;

    const newBot = {
      seat_index: targetSeatIndex,
      username: availableName,
      chips: tableSettings.startingStack || gameRoom?.startingStack || 1000,
      current_round_bet: 0,
      total_hand_bet: 0,
      status: 'active',
      last_action: null,
      cards: [],
      shownCards: false,
      isBot: true
    };

    const updated = [...players, newBot].sort((a, b) => a.seat_index - b.seat_index);
    setPlayers(updated);
    setAnnouncement(`🤖 Added ${availableName} (Bot) to Seat ${targetSeatIndex + 1}`);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'SEAT_TAKEN',
        payload: newBot
      });
    }
  };

  // Host Adds an AI Bot to fill the next available vacant seat
  const handleAddBot = () => {
    const totalMax = Math.max(2, Math.min(8, gameRoom?.maxPlayers || 6));
    if (players.length >= totalMax) {
      alert('Table is full!');
      return;
    }

    const occupiedSeats = players.map((p) => p.seat_index);
    let openSeat = 0;
    while (occupiedSeats.includes(openSeat) && openSeat < totalMax) {
      openSeat++;
    }

    if (openSeat < totalMax) {
      handleAddBotToSeat(openSeat);
    }
  };

  // Trigger flying chips animation from all players with bets to the center pot
  const triggerChipsFlight = (playersWithBets) => {
    const totalSeats = Math.max(players.length, gameRoom?.maxPlayers || 6);
    const flying = playersWithBets
      .filter((p) => p.current_round_bet > 0)
      .map((p) => {
        const coords = getSeatCoordinates(p.seat_index, totalSeats, mySeatIndex);
        const leftNum = parseFloat(coords.left) || 50;
        const topNum = parseFloat(coords.top) || 50;
        const dx = (leftNum - 50) * 4.6;
        const dy = (topNum - 45) * 2.8;
        return {
          id: `${p.seat_index}-${Date.now()}-${Math.random()}`,
          seatIndex: p.seat_index,
          amount: p.current_round_bet,
          startX: `${dx}px`,
          startY: `${dy}px`
        };
      });

    if (flying.length > 0) {
      setFlyingChips(flying);
      setTimeout(() => {
        playChipClink();
        setIsPotPulsing(true);
      }, 500);
      setTimeout(() => {
        setFlyingChips([]);
        setIsPotPulsing(false);
      }, 750);
    }
  };

  // Broadcast full synchronized table state to all connected players
  const broadcastTableState = (newPlayers, newHandState, newAnnouncement, winCards = [], actionInfo = null) => {
    const isShowdown = newHandState.phase === 'showdown' || newHandState.phase === 'ended';

    // 1. Sanitize for network: strip undealt deck, strip all opponent hole cards during active play
    const networkPlayers = sanitizePlayersForBroadcast(newPlayers, mySeatIndexRef.current, isShowdown);
    const networkHandState = sanitizeHandStateForBroadcast(newHandState);

    // 2. Sanitize for local React state:
    // Hero gets Hero's decrypted cards. Opponents get [] unless showdown.
    const localPlayers = newPlayers.map((p) => {
      const isHero = p.seat_index === mySeatIndexRef.current;
      if (isHero) {
        return {
          ...p,
          cards: (myDecryptedCardsRef.current && myDecryptedCardsRef.current.length >= 2)
            ? myDecryptedCardsRef.current
            : (p.cards || []),
          shownCards: isShowdown ? Boolean(p.shownCards) : false
        };
      }
      return {
        ...p,
        cards: (isShowdown && p.shownCards && Array.isArray(p.cards)) ? p.cards : [],
        shownCards: isShowdown ? Boolean(p.shownCards) : false
      };
    });

    setPlayers(localPlayers);
    setHandState(networkHandState);
    if (newAnnouncement) setAnnouncement(newAnnouncement);
    setWinningCards(winCards || []);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'TABLE_STATE_SYNC',
        payload: {
          players: networkPlayers,
          handState: networkHandState,
          announcement: newAnnouncement,
          winningCards: winCards || [],
          actor: actionInfo
        }
      });
    }
  };

  // Option for Hero to reveal cards at end of hand
  const handleShowHeroCards = () => {
    const hero = playersRef.current.find((p) => p.seat_index === mySeatIndexRef.current);
    const heroCards = (myDecryptedCardsRef.current && myDecryptedCardsRef.current.length >= 2)
      ? myDecryptedCardsRef.current
      : (hero?.cards || []);

    if (!hero || !heroCards || heroCards.length === 0) return;
    setHeroShowCardsClicked(true);
    const updated = playersRef.current.map((p) =>
      p.seat_index === mySeatIndexRef.current ? { ...p, shownCards: true, cards: heroCards } : p
    );
    const announcementMsg = `👁️ ${hero.username} revealed their cards!`;

    setPlayers(updated);
    setAnnouncement(announcementMsg);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'PLAYER_SHOW_CARDS',
        payload: {
          seatIndex: mySeatIndexRef.current,
          username: hero.username,
          cards: heroCards
        }
      });
    }
  };

  // Handle any player updating settings in the Waiting Lobby (supports atomic object patches)
  const handleUpdateSetting = (keyOrUpdates, value) => {
    const updates = typeof keyOrUpdates === 'object' && keyOrUpdates !== null
      ? keyOrUpdates
      : { [keyOrUpdates]: value };

    setTableSettings((prev) => {
      const updated = { ...prev, ...updates };

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'TABLE_SETTINGS_SYNC',
          payload: {
            settings: updated,
            updatedBy: user.username
          }
        });
      }

      if (activeRoomIdRef.current) {
        const dbPayload = {};
        if ('smallBlind' in updates) dbPayload.small_blind = updates.smallBlind;
        if ('bigBlind' in updates) dbPayload.big_blind = updates.bigBlind;
        if ('startingStack' in updates) dbPayload.starting_stack = updates.startingStack;
        if ('turnTime' in updates) dbPayload.turn_time_seconds = updates.turnTime;
        supabase
          .from('poker_rooms')
          .update(dbPayload)
          .eq('id', activeRoomIdRef.current)
          .then(() => {});
      }

      return updated;
    });
  };

  // Share or copy direct table invite link
  const handleShareInviteLink = async () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${gameRoom?.roomCode || ''}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join Poker Table: ${gameRoom?.name || "Texas Hold'em"}`,
          text: `Join my Texas Hold'em poker table with room code ${gameRoom?.roomCode}!`,
          url: inviteUrl
        });
        setAnnouncement('Invite shared!');
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteLinkCopied(true);
        setAnnouncement('🔗 Invite link copied to clipboard!');
        setTimeout(() => setInviteLinkCopied(false), 2500);
      }
    } catch {
      navigator.clipboard?.writeText(inviteUrl);
      setInviteLinkCopied(true);
      setAnnouncement('🔗 Invite link copied to clipboard!');
      setTimeout(() => setInviteLinkCopied(false), 2500);
    }
  };

  // Room creator can remove/kick players or bots
  const handleRemovePlayer = async (targetPlayer) => {
    if (!isCreator) {
      alert('Only the room creator can remove players from this table.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove "${targetPlayer.username}" from this table?`)) {
      return;
    }

    // 1. Bot removal
    if (targetPlayer.isBot) {
      setPlayers((prev) => prev.filter((p) => p.seat_index !== targetPlayer.seat_index));
      setAnnouncement(`Bot ${targetPlayer.username} was removed`);
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'PLAYER_REMOVED',
          payload: {
            seatIndex: targetPlayer.seat_index,
            username: targetPlayer.username,
            removedBy: user.username
          }
        });
      }
      return;
    }

    // 2. Real Player removal: Delete from Supabase & broadcast
    try {
      if (activeRoomIdRef.current) {
        await supabase
          .from('poker_room_players')
          .delete()
          .eq('room_id', activeRoomIdRef.current)
          .eq('seat_index', targetPlayer.seat_index);
      }

      setPlayers((prev) => prev.filter((p) => p.seat_index !== targetPlayer.seat_index));
      setAnnouncement(`${targetPlayer.username} was removed by room host`);

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'PLAYER_REMOVED',
          payload: {
            seatIndex: targetPlayer.seat_index,
            username: targetPlayer.username,
            removedBy: user.username
          }
        });
      }
    } catch (err) {
      console.warn('Error removing player:', err);
    }
  };

  // Handle Match Over / Tournament Victory
  const handleMatchOver = (champion) => {
    setMatchChampion(champion);
    setAnnouncement(`🏆 MATCH OVER! ${champion.username} is the CHAMPION!`);

    playWinCelebration();
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'MATCH_OVER',
        payload: {
          winner: champion
        }
      });
    }

    if (activeRoomIdRef.current) {
      supabase
        .from('poker_rooms')
        .update({ status: 'completed' })
        .eq('id', activeRoomIdRef.current)
        .then(() => {});
    }

    setLobbyRedirectCountdown(5);
  };

  // START HAND (Clockwise Blinds Rotation: Dealer -> SB -> BB -> UTG)
  const startNewHand = async () => {
    // Only allow starting when hand is waiting, ended, or at showdown
    if (!['waiting', 'ended', 'showdown'].includes(handStateRef.current.phase)) {
      return;
    }

    const currentPlayers = playersRef.current;
    if (currentPlayers.length < 2) {
      alert('At least 2 players are needed to start a hand. Invite a friend with the room code or click "+ Bot"!');
      return;
    }

    const activeList = currentPlayers.filter((p) => p.chips > 0).sort((a, b) => a.seat_index - b.seat_index);
    if (activeList.length < 2) {
      setAnnouncement('Not enough players with points remaining!');
      return;
    }

    const deck = generateDeck();
    let deckIdx = 0;

    // Reset dealer secret card memory
    dealerSecretCardsRef.current = {};

    // Advance Dealer button 1 active seat clockwise
    const currentDealerIdx = activeList.findIndex((p) => p.seat_index === handStateRef.current.dealerSeat);
    const nextDealerIdx = currentDealerIdx === -1 ? 0 : (currentDealerIdx + 1) % activeList.length;
    const nextDealerSeat = activeList[nextDealerIdx].seat_index;

    let sbSeat, bbSeat, utgSeat;
    if (activeList.length === 2) {
      // Heads-Up: Dealer is Small Blind and acts first pre-flop
      sbSeat = nextDealerSeat;
      bbSeat = activeList[(nextDealerIdx + 1) % 2].seat_index;
      utgSeat = nextDealerSeat;
    } else {
      // 3 to 8 players Ring Game
      sbSeat = activeList[(nextDealerIdx + 1) % activeList.length].seat_index;
      bbSeat = activeList[(nextDealerIdx + 2) % activeList.length].seat_index;
      utgSeat = activeList[(nextDealerIdx + 3) % activeList.length].seat_index;
    }

    setHeroShowCardsClicked(false);

    const isFirstHand = (handStateRef.current.handNumber || 0) === 0;
    const newHandNum = (handStateRef.current.handNumber || 0) + 1;
    let sbAmount = tableSettings.smallBlind ?? gameRoom?.smallBlind ?? 2;
    let bbAmount = tableSettings.bigBlind ?? gameRoom?.bigBlind ?? 4;

    // Apply blinds escalation frequency from custom options
    const freq = tableSettings.blindsFrequency || gameRoom?.blindsFrequency || 'fast_5';
    let multiplier = 1;
    if (freq === 'hyper_2' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 2));
    } else if (freq === 'fast_5' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 5));
    } else if (freq === 'standard_10' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 10));
    } else if (freq === 'slow_15' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 15));
    }
    sbAmount = sbAmount * multiplier;
    bbAmount = bbAmount * multiplier;

    const updatedPlayers = [];
    for (const p of currentPlayers) {
      const baseChips = isFirstHand ? (tableSettings.startingStack || p.chips || 1000) : p.chips;
      if (baseChips <= 0) {
        updatedPlayers.push({ ...p, chips: 0, status: 'sitting_out', cards: [], sealedCards: null });
        continue;
      }

      const c1 = deck[deckIdx++];
      const c2 = deck[deckIdx++];
      const rawCards = [c1, c2];

      // Keep unmasked raw cards strictly in dealer's memory ref
      dealerSecretCardsRef.current[p.seat_index] = rawCards;

      let bet = 0;
      let lastAction = null;

      if (p.seat_index === sbSeat) {
        bet = Math.min(baseChips, sbAmount);
        lastAction = 'small_blind';
      } else if (p.seat_index === bbSeat) {
        bet = Math.min(baseChips, bbAmount);
        lastAction = 'big_blind';
      }

      const isHero = p.seat_index === mySeatIndexRef.current;
      let pCards = [];
      let pSealed = null;

      if (isHero) {
        pCards = rawCards;
        myDecryptedCardsRef.current = rawCards;
      } else if (p.publicKey) {
        // Seal with opponent's public key (RSA-OAEP 2048-bit)
        pSealed = await sealHoleCards(rawCards, p.publicKey);
        pCards = [];
      } else {
        pCards = [];
      }

      updatedPlayers.push({
        ...p,
        chips: baseChips - bet,
        current_round_bet: bet,
        total_hand_bet: bet,
        status: baseChips - bet === 0 ? 'all_in' : 'active',
        last_action: lastAction,
        cards: pCards,
        sealedCards: pSealed,
        hasCards: true,
        shownCards: false
      });
    }

    // Keep undealt deck strictly in dealer's memory ref
    dealerDeckRef.current = deck.slice(deckIdx);

    playCardDeal();

    const utgPlayer = updatedPlayers.find((p) => p.seat_index === utgSeat);
    const initialAnnouncement = `Hand #${newHandNum} Dealt • Blinds: ${formatPoints(sbAmount)} / ${formatPoints(bbAmount)} • ${utgPlayer?.username || 'Player'}'s Turn`;

    const newHandState = {
      handNumber: newHandNum,
      phase: 'preflop',
      communityCards: [],
      deck: [], // NEVER put undealt deck in state or broadcast
      dealerHostSeat: mySeatIndexRef.current,
      currentTurnSeat: utgSeat,
      dealerSeat: nextDealerSeat,
      sbSeat,
      bbSeat,
      currentBet: bbAmount,
      minRaise: bbAmount,
      sbAmount,
      bbAmount,
      mainPot: sbAmount + bbAmount,
      sidePots: [],
      winners: []
    };

    broadcastTableState(updatedPlayers, newHandState, initialAnnouncement, []);
  };

  // Submit Player Action (Hero or local execution)
  const handlePlayerAction = (action, amount = 0) => {
    const currentSeat = handStateRef.current.currentTurnSeat;
    const isDealerHost = handStateRef.current.dealerHostSeat === mySeatIndexRef.current || gameRoom?.isPractice;

    // Immediate sound feedback
    if (action === 'fold') playFold();
    else if (action === 'check') playCheckKnock();
    else if (['call', 'bet', 'raise'].includes(action)) playChipClink();

    if (isDealerHost) {
      executeActionLogic(action, amount, currentSeat);
    } else {
      // Non-dealer sends player action to dealer host
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'PLAYER_ACTION',
          payload: {
            seatIndex: currentSeat,
            action,
            amount
          }
        });
      }
    }
  };

  // Core Betting Logic (Check, Call, Bet, Raise, Fold)
  const executeActionLogic = (action, amount, currentSeat) => {
    const currentPlayers = playersRef.current;
    const currentHandState = handStateRef.current;

    const playerIndex = currentPlayers.findIndex((p) => p.seat_index === currentSeat);
    if (playerIndex === -1) return;

    const player = currentPlayers[playerIndex];
    let updatedPlayers = [...currentPlayers];
    let newMainPot = currentHandState.mainPot;
    let newCurrentBet = currentHandState.currentBet;
    let newMinRaise = currentHandState.minRaise;
    let actionAnnouncement = '';

    const actorInfo = {
      username: player.username,
      action,
      amount,
      seatIndex: currentSeat
    };

    if (action === 'fold') {
      playFold();
      updatedPlayers[playerIndex] = {
        ...player,
        status: 'folded',
        last_action: 'fold'
      };
      actionAnnouncement = `${player.username} Folded`;
    } else if (action === 'check') {
      playCheckKnock();
      updatedPlayers[playerIndex] = {
        ...player,
        last_action: 'check'
      };
      actionAnnouncement = `${player.username} Checked`;
    } else if (action === 'call') {
      playChipClink();
      const callDiff = Math.min(player.chips, currentHandState.currentBet - player.current_round_bet);
      const newChips = player.chips - callDiff;
      newMainPot += callDiff;

      updatedPlayers[playerIndex] = {
        ...player,
        chips: newChips,
        current_round_bet: player.current_round_bet + callDiff,
        total_hand_bet: player.total_hand_bet + callDiff,
        status: newChips === 0 ? 'all_in' : 'active',
        last_action: 'call'
      };
      actionAnnouncement = `${player.username} Called ${formatPoints(callDiff)}`;
      triggerChipsFlight(updatedPlayers);
    } else if (action === 'bet' || action === 'raise') {
      playChipClink();
      const addBet = Math.min(player.chips, amount - player.current_round_bet);
      const newChips = player.chips - addBet;
      newMainPot += addBet;
      newMinRaise = Math.max(gameRoom?.bigBlind || 20, amount - currentHandState.currentBet);
      newCurrentBet = amount;

      updatedPlayers[playerIndex] = {
        ...player,
        chips: newChips,
        current_round_bet: player.current_round_bet + addBet,
        total_hand_bet: player.total_hand_bet + addBet,
        status: newChips === 0 ? 'all_in' : 'active',
        last_action: action
      };
      actionAnnouncement = `${player.username} ${action.toUpperCase()} to ${formatPoints(amount)}`;
      triggerChipsFlight(updatedPlayers);
    }

    // Check for uncontested winner (all folded except one)
    const remainingInHand = updatedPlayers.filter((p) => p.status === 'active' || p.status === 'all_in');
    if (remainingInHand.length === 1) {
      resolveUncontestedWinner(remainingInHand[0], newMainPot, updatedPlayers, actorInfo);
      return;
    }

    // Check if betting round complete (everyone matched currentBet or is all-in)
    const needToAct = updatedPlayers.filter(
      (p) => p.status === 'active' && (p.current_round_bet < newCurrentBet || !p.last_action)
    );

    if (needToAct.length === 0) {
      advanceStreet(updatedPlayers, newMainPot, actorInfo);
    } else {
      const nextSeat = getNextTurnSeat(currentSeat, updatedPlayers);
      const nextPlayer = updatedPlayers.find((p) => p.seat_index === nextSeat);

      const nextHandState = {
        ...currentHandState,
        mainPot: newMainPot,
        currentBet: newCurrentBet,
        minRaise: newMinRaise,
        currentTurnSeat: nextSeat
      };

      const announcementMsg = `${actionAnnouncement} • ${nextPlayer?.username || 'Player'}'s Turn`;

      broadcastTableState(updatedPlayers, nextHandState, announcementMsg, [], actorInfo);
    }
  };

  const getNextTurnSeat = (fromSeat, playersList) => {
    const activeSeats = playersList
      .filter((p) => p.status === 'active' && p.chips > 0)
      .map((p) => p.seat_index)
      .sort((a, b) => a - b);

    if (activeSeats.length === 0) return fromSeat;

    const nextHigher = activeSeats.find((s) => s > fromSeat);
    if (nextHigher !== undefined) return nextHigher;

    return activeSeats[0];
  };

  const advanceStreet = (playersList, currentPot, actorInfo) => {
    const currentHandState = handStateRef.current;
    let nextPhase = 'flop';
    let validCommunity = (currentHandState.communityCards || []).filter(c => typeof c === 'string' && c.length >= 2);
    let remainingDeck = [...(dealerDeckRef.current || [])];

    triggerChipsFlight(playersList);
    playCardDeal();

    // Reset round bets
    const resetPlayers = playersList.map((p) => ({
      ...p,
      current_round_bet: 0,
      last_action: p.status === 'folded' ? 'fold' : null
    }));

    // Collect all cards currently in play to prevent duplicates
    const allUsedCards = [
      ...validCommunity,
      ...resetPlayers.flatMap((p) => p.cards || []),
      ...Object.values(dealerSecretCardsRef.current || {}).flat()
    ];

    let targetCount = 3;
    if (currentHandState.phase === 'preflop') {
      nextPhase = 'flop';
      targetCount = 3;
    } else if (currentHandState.phase === 'flop') {
      nextPhase = 'turn';
      targetCount = 4;
    } else if (currentHandState.phase === 'turn') {
      nextPhase = 'river';
      targetCount = 5;
    } else if (currentHandState.phase === 'river') {
      dealerDeckRef.current = remainingDeck;
      resolveShowdown(resetPlayers, validCommunity, currentPot, actorInfo);
      return;
    }

    // Burn 1 card if available
    if (remainingDeck.length > 0) {
      remainingDeck.shift();
    }

    // Deal cards needed for the new street
    const cardsNeeded = Math.max(0, targetCount - validCommunity.length);
    if (cardsNeeded > 0) {
      const { drawn, remainingDeck: nextDeck } = drawCardsFromDeck(cardsNeeded, remainingDeck, allUsedCards);
      validCommunity.push(...drawn);
      remainingDeck = nextDeck;
    }

    // Check if remaining active contenders can make any further bets (i.e. at least 2 players have chips)
    const canAnyPlayerBet = resetPlayers.filter((p) => p.status === 'active' && p.chips > 0).length > 1;

    // If at most 1 player has chips left (all others are all-in or folded), run out the remaining board cards to showdown
    if (!canAnyPlayerBet && nextPhase !== 'river') {
      while (validCommunity.length < 5) {
        if (remainingDeck.length > 0) remainingDeck.shift(); // burn
        const { drawn, remainingDeck: nextDeck } = drawCardsFromDeck(1, remainingDeck, [
          ...validCommunity,
          ...resetPlayers.flatMap((p) => p.cards || []),
          ...Object.values(dealerSecretCardsRef.current || {}).flat()
        ]);
        validCommunity.push(...drawn);
        remainingDeck = nextDeck;
      }
      dealerDeckRef.current = remainingDeck;
      resolveShowdown(resetPlayers, validCommunity, currentPot, actorInfo);
      return;
    }

    dealerDeckRef.current = remainingDeck;

    // Postflop action starts with first active player clockwise from Dealer Button
    const firstActor = getNextTurnSeat(currentHandState.dealerSeat, resetPlayers);
    const actorPlayer = resetPlayers.find((p) => p.seat_index === firstActor);

    const nextHandState = {
      ...currentHandState,
      phase: nextPhase,
      communityCards: validCommunity,
      deck: [], // Undealt deck remains 100% private to dealer memory
      currentBet: 0,
      minRaise: gameRoom?.bigBlind || 20,
      mainPot: currentPot,
      currentTurnSeat: firstActor
    };

    const nextAnnouncement = `${nextPhase.toUpperCase()} Dealt • ${actorPlayer?.username || 'Hero'}'s Turn`;

    broadcastTableState(resetPlayers, nextHandState, nextAnnouncement, [], actorInfo);
  };

  const resolveShowdown = (playersList, communityCards, totalPot, actorInfo) => {
    let finalCommunity = (communityCards || []).filter(c => typeof c === 'string' && c.length >= 2);
    if (finalCommunity.length < 5) {
      const allUsed = [
        ...finalCommunity,
        ...playersList.flatMap((p) => p.cards || []),
        ...Object.values(dealerSecretCardsRef.current || {}).flat()
      ];
      const { drawn, remainingDeck: nextDeck } = drawCardsFromDeck(5 - finalCommunity.length, dealerDeckRef.current, allUsed);
      finalCommunity.push(...drawn);
      dealerDeckRef.current = nextDeck;
    }

    const contenders = playersList.filter((p) => p.status === 'active' || p.status === 'all_in');

    if (contenders.length === 0) return;

    if (contenders.length === 1) {
      resolveUncontestedWinner(contenders[0], totalPot, playersList, actorInfo);
      return;
    }

    // UNCALLED BET REFUND CALCULATION
    // If one contender bet more than the next highest contender (e.g. 1000 pts vs 50 pts all-in),
    // refund the uncalled excess (950 pts) immediately back to the higher bettor!
    let effectivePot = totalPot;
    let adjustedPlayers = [...playersList];
    if (contenders.length >= 2) {
      const sortedByBets = [...contenders].sort((a, b) => (b.total_hand_bet || 0) - (a.total_hand_bet || 0));
      const highestBet = sortedByBets[0].total_hand_bet || 0;
      const secondHighestBet = sortedByBets[1].total_hand_bet || 0;
      const uncalledExcess = Math.max(0, highestBet - secondHighestBet);

      if (uncalledExcess > 0) {
        const excessSeat = sortedByBets[0].seat_index;
        adjustedPlayers = adjustedPlayers.map((p) => {
          if (p.seat_index === excessSeat) {
            return {
              ...p,
              chips: p.chips + uncalledExcess,
              total_hand_bet: Math.max(0, p.total_hand_bet - uncalledExcess)
            };
          }
          return p;
        });
        effectivePot = Math.max(0, effectivePot - uncalledExcess);
      }
    }

    // Evaluate hands using dealer's private secret storage
    const evaluations = contenders.map((player) => {
      const secretCards = dealerSecretCardsRef.current[player.seat_index] || player.cards || [];
      const allCards = [...secretCards, ...finalCommunity];
      const evaluation = evaluateHand(allCards);
      return { player: { ...player, cards: secretCards }, evaluation };
    });

    evaluations.sort((a, b) => compareScores(b.evaluation?.score || [0], a.evaluation?.score || [0]));

    const bestScore = evaluations[0]?.evaluation?.score || [0];
    const bestEval = evaluations[0]?.evaluation || { name: 'Winning Hand' };
    const winCards = bestEval.cards || [];

    // All contenders tied for best score
    const winnersList = evaluations.filter(
      (e) => compareScores(e.evaluation?.score || [0], bestScore) === 0
    );

    const splitShare = Math.floor(effectivePot / winnersList.length);
    const remainder = effectivePot % winnersList.length;

    // Reveal hole cards for contenders at showdown ONLY
    const revealedPlayers = adjustedPlayers.map((p) => {
      const isContender = contenders.some((c) => c.seat_index === p.seat_index);
      const winnerIndex = winnersList.findIndex((w) => w.player.seat_index === p.seat_index);
      const secretCards = dealerSecretCardsRef.current[p.seat_index] || p.cards || [];

      if (winnerIndex !== -1) {
        const bonus = splitShare + (winnerIndex === 0 ? remainder : 0);
        return {
          ...p,
          chips: p.chips + bonus,
          cards: secretCards,
          shownCards: true
        };
      }
      return isContender ? { ...p, cards: secretCards, shownCards: true } : { ...p, cards: [], shownCards: false };
    });

    let winAnnouncement = '';
    if (winnersList.length > 1) {
      const names = winnersList.map((w) => w.player.username).join(' & ');
      winAnnouncement = `🤝 Split Pot! ${names} each win ${formatPoints(splitShare)} with ${bestEval.name}!`;
    } else {
      const singleWinner = winnersList[0].player;
      winAnnouncement = `🏆 ${singleWinner.username} Wins ${formatPoints(effectivePot)} with ${bestEval.name}!`;
    }

    playWinCelebration();
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
    setWinningCards(winCards);

    const nextHandState = {
      ...handStateRef.current,
      phase: 'showdown',
      communityCards: finalCommunity,
      deck: [],
      mainPot: effectivePot,
      winners: winnersList.map((w, idx) => ({
        seat_index: w.player.seat_index,
        amount: splitShare + (idx === 0 ? remainder : 0),
        handName: w.evaluation?.name || bestEval.name
      }))
    };

    broadcastTableState(revealedPlayers, nextHandState, winAnnouncement, winCards, actorInfo);

    // TOURNAMENT / MATCH OVER CHECK
    // If only 1 player has chips remaining, match is completely over!
    const activeContendersWithChips = revealedPlayers.filter((p) => p.chips > 0);
    if (activeContendersWithChips.length === 1 && revealedPlayers.length >= 2) {
      setTimeout(() => {
        handleMatchOver(activeContendersWithChips[0]);
      }, 1500);
    }
  };

  const resolveUncontestedWinner = (winner, totalPot, playersList, actorInfo) => {
    triggerChipsFlight(playersList);

    const updated = playersList.map((p) => {
      if (p.seat_index === winner.seat_index) {
        return { ...p, chips: p.chips + totalPot };
      }
      return p;
    });

    const winAnnouncement = `🏆 ${winner.username} takes ${formatPoints(totalPot)} (All folded)`;

    playWinCelebration();
    confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });

    let finalCommunity = (handStateRef.current.communityCards || []).filter(c => typeof c === 'string' && c.length >= 2);
    if (gameRoom?.showRemainingRiverCards && finalCommunity.length < 5) {
      const remainingDeck = [...(dealerDeckRef.current || [])];
      const needed = 5 - finalCommunity.length;
      const allUsed = [
        ...finalCommunity,
        ...playersList.flatMap((p) => p.cards || []),
        ...Object.values(dealerSecretCardsRef.current || {}).flat()
      ];
      const { drawn, remainingDeck: nextDeck } = drawCardsFromDeck(needed, remainingDeck, allUsed);
      finalCommunity = [...finalCommunity, ...drawn];
      dealerDeckRef.current = nextDeck;
    }

    const nextHandState = {
      ...handStateRef.current,
      phase: 'ended',
      communityCards: finalCommunity,
      deck: [],
      mainPot: totalPot,
      winners: [{ seat_index: winner.seat_index, amount: totalPot, handName: 'Uncontested' }]
    };

    broadcastTableState(updated, nextHandState, winAnnouncement, [], actorInfo);

    // TOURNAMENT / MATCH OVER CHECK
    // If only 1 player has chips remaining, match is completely over!
    const activeContendersWithChips = updated.filter((p) => p.chips > 0);
    if (activeContendersWithChips.length === 1 && updated.length >= 2) {
      setTimeout(() => {
        handleMatchOver(activeContendersWithChips[0]);
      }, 1500);
    }
  };

  const executeBotTurn = (bot) => {
    const currentHandState = handStateRef.current;
    const toCall = currentHandState.currentBet - bot.current_round_bet;
    const pot = currentHandState.mainPot;
    const potOdds = toCall / (pot + toCall || 1);

    const botCards = dealerSecretCardsRef.current[bot.seat_index] || bot.cards || [];
    const allCards = [...botCards, ...currentHandState.communityCards];
    const handEval = evaluateHand(allCards);
    const handStrengthTier = handEval.type;

    if (toCall === 0) {
      if (handStrengthTier >= 3 && Math.random() > 0.4) {
        handlePlayerAction('bet', Math.min(bot.chips, currentHandState.currentBet + (gameRoom?.bigBlind || 20) * 2));
      } else {
        handlePlayerAction('check', 0);
      }
    } else {
      if (handStrengthTier >= 4 || (handStrengthTier >= 2 && potOdds < 0.35)) {
        if (handStrengthTier >= 6 && Math.random() > 0.5) {
          handlePlayerAction('raise', Math.min(bot.chips, currentHandState.currentBet + currentHandState.minRaise * 2));
        } else {
          handlePlayerAction('call', toCall);
        }
      } else if (potOdds < 0.15 || Math.random() < 0.25) {
        handlePlayerAction('call', toCall);
      } else {
        handlePlayerAction('fold', 0);
      }
    }
  };

  const handleTurnTimeout = () => {
    // 1. If it's my turn, submit timeout action
    if (handStateRef.current.currentTurnSeat === mySeatIndexRef.current) {
      const currentP = playersRef.current.find((p) => p.seat_index === mySeatIndexRef.current);
      if (!currentP) return;

      if (currentP.current_round_bet === handStateRef.current.currentBet) {
        handlePlayerAction('check', 0);
      } else {
        handlePlayerAction('fold', 0);
      }
      return;
    }

    // 2. If I am the dealer host and an opponent timed out, auto-resolve their turn
    if (handStateRef.current.dealerHostSeat === mySeatIndexRef.current) {
      const timedOutP = playersRef.current.find((p) => p.seat_index === handStateRef.current.currentTurnSeat);
      if (!timedOutP) return;

      if (timedOutP.current_round_bet === handStateRef.current.currentBet) {
        executeActionLogic('check', 0, timedOutP.seat_index);
      } else {
        executeActionLogic('fold', 0, timedOutP.seat_index);
      }
    }
  };

  const copyRoomCode = () => {
    if (gameRoom?.roomCode) {
      navigator.clipboard.writeText(gameRoom.roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const heroPlayer = players.find((p) => p.seat_index === mySeatIndex);
  const heroHandRank = heroPlayer?.cards?.length
    ? evaluateHand([...heroPlayer.cards, ...handState.communityCards])
    : null;

  const currentTurnPlayer = players.find((p) => p.seat_index === handState.currentTurnSeat);
  const isWaitingOrEnded = handState.phase === 'waiting' || handState.phase === 'ended' || handState.phase === 'showdown';

  return (
    <div className="table-viewport-container">
      {/* Unified Single-Line Table Header Bar with Integrated Telemetry & 3-Dots Menu */}
      <header className="table-header-bar">
        {/* Left: Lobby Back & Table Identity */}
        <div className="table-header-left">
          <button
            onClick={onLeaveTable}
            className="table-nav-btn table-back-btn"
            title="Leave Table (Back to Lobby)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="table-nav-btn-text">Lobby</span>
          </button>

          <div className="table-header-title-box">
            <h2 className="table-room-title">
              {gameRoom?.roomName || 'Poker Room'}
            </h2>
            <button
              onClick={copyRoomCode}
              className="table-code-badge"
              title="Click to copy room code"
            >
              <span>{gameRoom?.roomCode || 'CODE'}</span>
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Center: Integrated Information Board Telemetry (Desktop View - Same Line!) */}
        <div className="table-header-telemetry-desktop">
          <div className="table-telemetry-chip">
            <span className="telemetry-label">BLINDS</span>
            <span className="telemetry-val">
              {formatPointsOnly(handState.smallBlind || tableSettings.smallBlind || 50)} / {formatPointsOnly(handState.bigBlind || tableSettings.bigBlind || 100)}
            </span>
          </div>

          <div className="table-telemetry-chip">
            <span className="telemetry-label">HAND</span>
            <span className="telemetry-val">
              #{handState.handNumber || 1} • <span className="telemetry-phase">{handState.phase === 'waiting' ? 'WAIT' : handState.phase.toUpperCase()}</span>
            </span>
          </div>

          <div className="table-telemetry-chip pot-chip">
            <span className="telemetry-label">POT</span>
            <span className="telemetry-val gold">
              {formatPoints(handState.mainPot || 0)}
            </span>
          </div>

          <div className={`table-telemetry-chip timer-chip ${handState.currentTurnSeat === mySeatIndex && !isWaitingOrEnded ? 'is-hero' : ''} ${turnMaxTime > 0 && turnTimeLeft <= 5 && !isWaitingOrEnded ? 'is-urgent' : ''}`}>
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="telemetry-val">
              {handState.currentTurnSeat === mySeatIndex && !isWaitingOrEnded ? (
                <span className="hero-turn-text">
                  YOUR TURN: <strong>{turnMaxTime > 0 ? `${turnTimeLeft}s` : '∞ NO LIMIT'}</strong>
                </span>
              ) : !isWaitingOrEnded ? (
                <span>
                  {currentTurnPlayer?.username || 'Turn'}: <strong>{turnMaxTime > 0 ? `${turnTimeLeft}s` : '∞'}</strong>
                </span>
              ) : (
                <span>{turnMaxTime > 0 ? `${turnMaxTime}s LIMIT` : '∞ NO LIMIT'}</span>
              )}
            </span>
          </div>

          {announcement && (
            <div className="table-header-announcement">
              <span className="telemetry-dot">●</span>
              <span className="telemetry-announcement-text">{announcement}</span>
            </div>
          )}
        </div>

        {/* Right: Quick Deal Action + 3-Dots Menu Button */}
        <div className="table-header-right" ref={menuRef}>
          {isWaitingOrEnded && (
            <button
              onClick={startNewHand}
              className="table-nav-btn table-deal-btn"
              style={{ background: '#059669', borderColor: '#34d399', color: '#ffffff', fontWeight: 900 }}
              title="Deal Next Hand"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{handState.handNumber === 0 ? 'Deal' : 'Next'}</span>
            </button>
          )}

          {/* 3-Dots Menu Button (Mobile & Desktop) */}
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className={`table-nav-btn table-menu-btn ${isMenuOpen ? 'active' : ''}`}
            title="Table Options Menu"
            aria-label="Table Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* 3-Dots Dropdown Menu */}
          {isMenuOpen && (
            <div className="table-dropdown-menu">
              <div className="table-dropdown-header">
                <span className="table-dropdown-title">Table Options</span>
                <span className="table-dropdown-code">{gameRoom?.roomCode}</span>
              </div>

              <div className="table-dropdown-items">
                {onOpenSocial && (
                  <button
                    onClick={() => {
                      onOpenSocial();
                      setIsMenuOpen(false);
                    }}
                    className="table-dropdown-item"
                  >
                    <Users className="w-4 h-4 text-sky-400" />
                    <span>Invite Online Friends</span>
                    <span className="table-dropdown-badge">{onlineCount}</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setFeltTheme(feltTheme === 'emerald' ? 'midnight' : 'emerald');
                  }}
                  className="table-dropdown-item"
                >
                  <Palette className="w-4 h-4 text-emerald-400" />
                  <span>Felt Style:</span>
                  <span className="table-dropdown-val">{feltTheme === 'emerald' ? 'Velvet Green' : 'Midnight Dark'}</span>
                </button>

                <button
                  onClick={() => setSoundOn(toggleSound())}
                  className="table-dropdown-item"
                >
                  {soundOn ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
                  <span>Sound Effects:</span>
                  <span className="table-dropdown-val">{soundOn ? 'On' : 'Muted'}</span>
                </button>

                {onToggleTheme && (
                  <button
                    onClick={() => onToggleTheme()}
                    className="table-dropdown-item"
                  >
                    {theme === 'light' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                    <span>Theme:</span>
                    <span className="table-dropdown-val">{theme === 'light' ? 'Light' : 'Dark'}</span>
                  </button>
                )}

                {isWaitingOrEnded && players.length < (gameRoom?.maxPlayers || 6) && (
                  <button
                    onClick={() => {
                      handleAddBot();
                      setIsMenuOpen(false);
                    }}
                    className="table-dropdown-item"
                  >
                    <UserPlus className="w-4 h-4 text-indigo-400" />
                    <span>+ Add Practice Bot</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    copyRoomCode();
                    setIsMenuOpen(false);
                  }}
                  className="table-dropdown-item"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copy Room Code</span>
                  <span className="table-dropdown-val">{gameRoom?.roomCode}</span>
                </button>

                {isCreator && (
                  <>
                    <div className="table-dropdown-divider" />
                    <div style={{ padding: '6px 12px 3px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.45)' }}>
                      Manage Table ({players.length}/{gameRoom?.maxPlayers || 6})
                    </div>
                    {players.filter((p) => p.seat_index !== mySeatIndex).map((opponent) => (
                      <div
                        key={opponent.seat_index}
                        className="table-dropdown-item"
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600 }}>{opponent.username}</span>
                          {opponent.isBot ? (
                            <span style={{ fontSize: '8px', fontWeight: 800, background: 'rgba(168,85,247,0.3)', color: '#c084fc', padding: '1px 5px', borderRadius: '4px' }}>BOT</span>
                          ) : (
                            <span style={{ fontSize: '8px', fontWeight: 800, background: 'rgba(59,130,246,0.3)', color: '#93c5fd', padding: '1px 5px', borderRadius: '4px' }}>LIVE</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleRemovePlayer(opponent);
                            setIsMenuOpen(false);
                          }}
                          style={{
                            background: 'rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </>
                )}

                <div className="table-dropdown-divider" />

                <button
                  onClick={() => {
                    onLeaveTable();
                    setIsMenuOpen(false);
                  }}
                  className="table-dropdown-item danger"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span>Leave Table</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Mobile View Telemetry Strip (100% on the screen, NO horizontal scrolling!) */}
        <div className="table-mobile-telemetry-strip">
          <div className="table-mobile-stat">
            <span className="stat-label">BLINDS</span>
            <span className="stat-val">{formatPointsOnly(handState.smallBlind || 50)}/{formatPointsOnly(handState.bigBlind || 100)}</span>
          </div>
          <div className="table-mobile-stat">
            <span className="stat-label">HAND</span>
            <span className="stat-val">#{handState.handNumber || 1}</span>
          </div>
          <div className="table-mobile-stat">
            <span className="stat-label">POT</span>
            <span className="stat-val gold">{formatPoints(handState.mainPot || 0)}</span>
          </div>
          <div className={`table-mobile-stat timer ${handState.currentTurnSeat === mySeatIndex && !isWaitingOrEnded ? 'hero' : ''} ${turnMaxTime > 0 && turnTimeLeft <= 5 && !isWaitingOrEnded ? 'urgent' : ''}`}>
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="stat-val">
              {handState.currentTurnSeat === mySeatIndex && !isWaitingOrEnded
                ? `${turnMaxTime > 0 ? `${turnTimeLeft}s` : '∞'}`
                : (!isWaitingOrEnded ? (turnMaxTime > 0 ? `${turnTimeLeft}s` : '∞') : (turnMaxTime > 0 ? `${turnMaxTime}s` : '∞'))}
            </span>
          </div>
        </div>

        {/* Mobile Announcement Marquee (Compact 1-line ticker) */}
        {announcement && (
          <div className="table-mobile-marquee-strip">
            <span className="dot">●</span>
            <span className="text">{announcement}</span>
          </div>
        )}
      </header>

      {/* Main Table Felt Stage */}
      <main className="table-stage">
        {/* Real Oval Table Outer Border */}
        <div className="poker-table-outer">
          <div className="poker-table-brass-rim">
            <div className={`poker-table-felt-canvas ${feltTheme === 'emerald' ? 'felt-emerald' : 'felt-midnight'}`}>
              <div className="poker-betting-line" />

              {/* Flying Chip Animation towards Center Pot */}
              {flyingChips.map((fc) => (
                <div
                  key={fc.id}
                  className="flying-chip-particle"
                  style={{
                    '--startX': fc.startX,
                    '--startY': fc.startY
                  }}
                >
                  <PokerChipSVG value={20} size={28} />
                </div>
              ))}

              {/* Center Community Cards Area */}
              <CommunityArea
                communityCards={handState.communityCards}
                mainPot={handState.mainPot}
                sidePots={handState.sidePots}
                phase={handState.phase}
                winningCards={winningCards}
                isPotPulsing={isPotPulsing}
              />

              {/* Seated Players & Vacant Spaces: Positioned on the OUTER RAIL */}
              {Array.from({ length: Math.max(2, Math.min(8, gameRoom?.maxPlayers || 6)) }, (_, seatIdx) => {
                const totalSeats = Math.max(2, Math.min(8, gameRoom?.maxPlayers || 6));
                const player = players.find((p) => p.seat_index === seatIdx);
                const pos = getSeatCoordinates(seatIdx, totalSeats, mySeatIndex);
                const isWinner = player ? handState.winners.some((w) => w.seat_index === player.seat_index) : false;

                return (
                  <PlayerSeat
                    key={seatIdx}
                    player={player || null}
                    seatIndex={seatIdx}
                    position={pos}
                    isHero={player ? player.seat_index === mySeatIndex : false}
                    isHandEnded={isWaitingOrEnded}
                    isDealer={player ? player.seat_index === handState.dealerSeat : false}
                    isSB={player ? player.seat_index === handState.sbSeat : false}
                    isBB={player ? player.seat_index === handState.bbSeat : false}
                    isCurrentTurn={player ? (player.seat_index === handState.currentTurnSeat && !isWaitingOrEnded) : false}
                    turnTimeLeft={turnTimeLeft}
                    turnMaxTime={turnMaxTime}
                    isWinner={isWinner}
                    winningCards={winningCards}
                    onSit={handleSitAtSeat}
                    isCreator={isCreator}
                    onRemovePlayer={handleRemovePlayer}
                    onAddBotToSeat={handleAddBotToSeat}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Action HUD or Waiting / Hand Completed Controls (No center popup) */}
      {!isWaitingOrEnded ? (
        <PlayerHUD
          isMyTurn={handState.currentTurnSeat === mySeatIndex}
          heroPlayer={heroPlayer}
          currentTurnPlayerName={currentTurnPlayer?.username}
          currentBet={handState.currentBet}
          minRaise={handState.minRaise}
          bigBlind={handState.bbAmount || tableSettings.bigBlind || gameRoom?.bigBlind || 20}
          mainPot={handState.mainPot}
          onAction={handlePlayerAction}
        />
      ) : (
        /* Sleek Bottom Control Bar (Replaces Center Popup, Felt Remains 100% Clean) */
        <div className="poker-hud-wrapper">
          <div
            className="poker-hud-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="table-status-label">
                {handState.handNumber === 0 ? 'TABLE READY' : 'HAND COMPLETED'}
              </span>
              <span className="table-status-dot">•</span>
              <span className="table-status-desc">
                {players.length < 2 ? 'Waiting for players' : announcement}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Option to show cards at end of hand */}
              {heroPlayer?.cards?.length >= 2 && !heroPlayer.shownCards && !heroShowCardsClicked && (
                <button
                  type="button"
                  onClick={handleShowHeroCards}
                  className="table-nav-btn"
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    borderColor: '#818cf8',
                    color: '#ffffff',
                    fontWeight: 900,
                    padding: '8px 14px'
                  }}
                  title="Reveal your cards to the table"
                >
                  <span>👁️ SHOW CARDS</span>
                </button>
              )}

              {handState.handNumber === 0 && (
                <button
                  type="button"
                  onClick={() => setIsWaitingLobbyMinimized((prev) => !prev)}
                  className="table-nav-btn"
                  style={{
                    background: isWaitingLobbyMinimized ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.4)',
                    borderColor: '#818cf8',
                    color: '#e0e7ff',
                    padding: '8px 12px'
                  }}
                  title="Table Settings & Lobby"
                >
                  <Settings className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isWaitingLobbyMinimized ? 'Settings & Lobby' : 'Hide Lobby'}</span>
                </button>
              )}

              {players.length < (gameRoom?.maxPlayers || 6) && (
                <button
                  type="button"
                  onClick={handleAddBot}
                  className="table-nav-btn table-bot-btn"
                  style={{ padding: '8px 12px' }}
                >
                  <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>+ Bot</span>
                </button>
              )}

              <button
                type="button"
                onClick={startNewHand}
                className="table-nav-btn"
                style={{
                  background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  borderColor: '#34d399',
                  color: '#ffffff',
                  fontWeight: 900,
                  padding: '8px 16px'
                }}
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{handState.handNumber === 0 ? 'DEAL FIRST HAND' : 'NEXT HAND'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING RE-OPEN BUTTON FOR MINIMIZED WAITING LOBBY */}
      {handState.handNumber === 0 && handState.phase === 'waiting' && isWaitingLobbyMinimized && (
        <button
          type="button"
          onClick={() => setIsWaitingLobbyMinimized(false)}
          className="waiting-minimized-floating-btn"
          title="Open Waiting Lobby Settings"
        >
          <Settings className="w-4 h-4 text-emerald-400" />
          <span>Waiting Lobby Settings ({players.length}/{gameRoom?.maxPlayers || 6})</span>
        </button>
      )}

      {/* 1. WAITING LOBBY MODAL (Hand 0 / Pre-match stage) */}
      {handState.handNumber === 0 && handState.phase === 'waiting' && !isWaitingLobbyMinimized && (
        <div className="waiting-lobby-overlay">
          <div className="waiting-lobby-card">
            <div className="waiting-lobby-header">
              <div className="waiting-lobby-header-left">
                <div className="waiting-lobby-badge-row">
                  <span className="waiting-lobby-badge">WAITING LOBBY</span>
                  <span className="waiting-lobby-badge-status">
                    {players.length >= 2 ? '🟢 Ready to Deal' : '🟡 Gathering Players'}
                  </span>
                </div>
                <h2 className="waiting-lobby-title">{gameRoom?.name || 'High Stakes Poker Table'}</h2>
                <div className="waiting-lobby-meta">
                  <div className="waiting-lobby-code-box">
                    <span className="waiting-lobby-meta-lbl">Room Code:</span>
                    <span className="waiting-lobby-code-val">{gameRoom?.roomCode || '---'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(gameRoom?.roomCode || '');
                        setAnnouncement('Room code copied to clipboard!');
                      }}
                      className="waiting-lobby-copy-btn"
                      title="Copy Room Code"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleShareInviteLink}
                      className="waiting-lobby-copy-btn waiting-lobby-link-icon-btn"
                      title="Copy / Share Invite Link"
                    >
                      {inviteLinkCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link className="w-3.5 h-3.5 text-sky-400" />}
                    </button>
                  </div>
                  {gameRoom?.host_username && (
                    <div className="waiting-lobby-host-box">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Host: <strong>{gameRoom.host_username}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsWaitingLobbyMinimized(true)}
                className="waiting-lobby-minimize-btn"
                title="Minimize lobby to view table felt"
              >
                <span>View Table Felt</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            <div className="waiting-lobby-body">
              {/* Seated Players Roster */}
              <div className="waiting-lobby-section">
                <div className="waiting-lobby-section-head">
                  <div className="waiting-lobby-section-title">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span>Seated Players ({players.length} / {gameRoom?.maxPlayers || 6})</span>
                  </div>

                  <div className="waiting-lobby-actions-group">
                    {/* Invite via direct URL link */}
                    <button
                      type="button"
                      onClick={handleShareInviteLink}
                      className="waiting-lobby-link-btn"
                      title="Invite anyone via direct link"
                    >
                      {inviteLinkCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Link Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Invite Link</span>
                        </>
                      )}
                    </button>

                    {/* Invite live friends from Social Suite */}
                    {onOpenSocial && (
                      <button
                        type="button"
                        onClick={onOpenSocial}
                        className="waiting-lobby-invite-btn"
                        title="Invite online friends"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Invite Friends</span>
                      </button>
                    )}

                    {/* Add Practice Bot */}
                    {players.length < (gameRoom?.maxPlayers || 6) && (
                      <button
                        type="button"
                        onClick={handleAddBot}
                        className="waiting-lobby-addbot-btn"
                        title="Add a practice bot"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+ Add Practice Bot</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="waiting-lobby-roster-grid">
                  {players.map((p) => {
                    const isHero = p.seat_index === mySeatIndex;
                    return (
                      <div
                        key={p.seat_index}
                        className={`waiting-roster-chip ${isHero ? 'is-hero' : ''} ${p.isBot ? 'is-bot' : ''} ${isCreator && !isHero ? 'has-kick' : ''}`}
                      >
                        <div className="waiting-roster-avatar">
                          {p.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="waiting-roster-info">
                          <div className="waiting-roster-name-row">
                            <span className="waiting-roster-name">{p.username}</span>
                            {isHero && <span className="waiting-you-badge">YOU</span>}
                            {p.isBot && <span className="waiting-bot-tag">BOT</span>}
                          </div>
                          <span className="waiting-roster-stack">
                            {formatPoints(p.chips || tableSettings.startingStack)}
                          </span>
                        </div>

                        {/* Sleek top-right ✕ kick button for creator */}
                        {isCreator && !isHero && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePlayer(p);
                            }}
                            className="waiting-roster-kick-btn"
                            title={`Remove ${p.username} from table`}
                            aria-label={`Remove ${p.username}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Editable Settings (Any seated player can customize before match start) */}
              <div className="waiting-lobby-section">
                <div className="waiting-lobby-section-head">
                  <div className="waiting-lobby-section-title">
                    <Settings className="w-4 h-4 text-emerald-400" />
                    <span>Table Settings (Editable by Anyone in Waiting Lobby)</span>
                  </div>
                  <span className="waiting-sync-indicator">⚡ Live synced to all players</span>
                </div>

                <div className="waiting-lobby-settings-grid">
                  {/* Starting Stack */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <Coins className="w-3.5 h-3.5 text-amber-400" />
                      <span>Starting Chips</span>
                    </label>
                    <div className="waiting-setting-pills stack-pills">
                      {[500, 1000, 1500, 2500, 5000].map((stack) => (
                        <button
                          key={stack}
                          type="button"
                          onClick={() => handleUpdateSetting({ startingStack: stack })}
                          className={`waiting-pill-btn ${tableSettings.startingStack === stack ? 'active' : ''}`}
                        >
                          {formatPoints(stack)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Blinds */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <Trophy className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Blinds (Small / Big)</span>
                    </label>
                    <div className="waiting-setting-pills">
                      {[
                        { sb: 2, bb: 4, label: '2 / 4' },
                        { sb: 5, bb: 10, label: '5 / 10' },
                        { sb: 10, bb: 20, label: '10 / 20' },
                        { sb: 25, bb: 50, label: '25 / 50' },
                        { sb: 50, bb: 100, label: '50 / 100' }
                      ].map((b) => (
                        <button
                          key={b.label}
                          type="button"
                          onClick={() => {
                            handleUpdateSetting({ smallBlind: b.sb, bigBlind: b.bb });
                          }}
                          className={`waiting-pill-btn ${tableSettings.smallBlind === b.sb && tableSettings.bigBlind === b.bb ? 'active' : ''}`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Turn Timer */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Shot Clock / Timer</span>
                    </label>
                    <div className="waiting-setting-pills">
                      {[
                        { sec: 0, label: '∞ No Limit' },
                        { sec: 15, label: '15s Blitz' },
                        { sec: 30, label: '30s Rapid' },
                        { sec: 60, label: '60s Normal' },
                        { sec: 120, label: '120s Deep' }
                      ].map((t) => (
                        <button
                          key={t.sec}
                          type="button"
                          onClick={() => handleUpdateSetting({ turnTime: t.sec })}
                          className={`waiting-pill-btn ${tableSettings.turnTime === t.sec ? 'active' : ''}`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Blind Escalation */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Blind Escalation</span>
                    </label>
                    <div className="waiting-setting-pills">
                      {[
                        { id: 'hyper_2', label: 'Every 2 Hands' },
                        { id: 'fast_5', label: 'Every 5 Hands' },
                        { id: 'standard_10', label: 'Every 10 Hands' },
                        { id: 'never', label: 'Fixed Blinds' }
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => handleUpdateSetting({ blindsFrequency: f.id })}
                          className={`waiting-pill-btn ${tableSettings.blindsFrequency === f.id ? 'active' : ''}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="waiting-lobby-footer">
              <div className="waiting-lobby-status-note">
                {players.length < 2 ? (
                  <span className="text-amber-400 font-semibold">
                    ⚠️ Waiting for at least 2 players to start the match (click "+ Add Practice Bot" if solo)
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold">
                    ✨ {players.length} players ready. Anyone can launch the match!
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={startNewHand}
                disabled={players.length < 2}
                className="waiting-lobby-start-btn"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>START MATCH</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. MATCH OVER / TOURNAMENT CHAMPION VICTORY OVERLAY */}
      {matchChampion && (
        <div className="match-over-backdrop">
          <div className="match-over-card">
            <div className="match-over-trophy-container">
              <Trophy className="w-20 h-20 text-amber-400 match-over-trophy-icon" />
              <div className="match-over-glow" />
            </div>

            <span className="match-over-badge">TOURNAMENT WINNER</span>
            <h2 className="match-over-champ-name">{matchChampion.username}</h2>
            <p className="match-over-desc">
              All other players have been eliminated!
            </p>

            <div className="match-over-stats-row">
              <div className="match-over-stat-box">
                <span className="match-over-stat-lbl">Winning Stack</span>
                <span className="match-over-stat-val text-amber-400">
                  {formatPoints(matchChampion.chips)}
                </span>
              </div>
              <div className="match-over-stat-box">
                <span className="match-over-stat-lbl">Result</span>
                <span className="match-over-stat-val text-emerald-400">
                  1st Place Victory
                </span>
              </div>
            </div>

            <div className="match-over-redirect-panel">
              <div className="match-over-spinner" />
              <span>
                Redirecting all players to lobby in{' '}
                <strong className="text-amber-400 font-bold">{lobbyRedirectCountdown ?? 0}s</strong>...
              </span>
            </div>

            <button
              type="button"
              onClick={onLeaveTable}
              className="match-over-return-btn"
            >
              Return to Lobby Immediately
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
