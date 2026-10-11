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
  Users
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
import { PlayerSeat } from './PlayerSeat';
import { CommunityArea } from './CommunityArea';
import { PlayerHUD } from './PlayerHUD';
import { PokerChipSVG } from './ChipStack';

const BOT_NAMES = ['Viper', 'AceHigh', 'BluffKing', 'Maverick', 'ChipLeader', 'LadyLuck', 'RiverRat'];

export const PokerTable = ({
  gameRoom,
  user,
  onLeaveTable
}) => {
  const [feltTheme, setFeltTheme] = useState('emerald');
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [copiedCode, setCopiedCode] = useState(false);

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
    minRaise: gameRoom?.bigBlind || 20,
    mainPot: 0,
    sidePots: [],
    winners: []
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(gameRoom?.turnTime || 120);
  const turnMaxTime = gameRoom?.turnTime || 120;
  const [winningCards, setWinningCards] = useState([]);
  const [announcement, setAnnouncement] = useState('Waiting for host to start hand');

  // Animation & Interaction states
  const [flyingChips, setFlyingChips] = useState([]);
  const [isPotPulsing, setIsPotPulsing] = useState(false);
  const [heroShowCardsClicked, setHeroShowCardsClicked] = useState(false);

  const channelRef = useRef(null);
  const turnTimerRef = useRef(null);
  const activeRoomIdRef = useRef(null);
  const playersRef = useRef(players);
  const handStateRef = useRef(handState);
  const mySeatIndexRef = useRef(mySeatIndex);
  const announcementRef = useRef(announcement);

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
            chips: gameRoom?.startingStack || 1500,
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
            chips: gameRoom?.startingStack || 1500,
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
            chips: myExisting?.chips || gameRoom.startingStack || 1500,
            current_round_bet: 0,
            total_hand_bet: 0,
            status: 'active',
            is_connected: true
          }, { onConflict: 'room_id,seat_index' });
        } catch (err) {
          console.warn('Error inserting into poker_room_players:', err);
        }
      }

      // 6. Build combined players list
      const heroPlayer = {
        seat_index: assignedSeat,
        user_id: user.id,
        username: user.username,
        chips: myExisting?.chips || gameRoom.startingStack || 1500,
        current_round_bet: 0,
        total_hand_bet: 0,
        status: 'active',
        last_action: null,
        cards: [],
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
            chips: p.chips || gameRoom.startingStack || 1500,
            current_round_bet: p.current_round_bet || 0,
            total_hand_bet: p.total_hand_bet || 0,
            status: p.status || 'active',
            last_action: p.last_action || null,
            cards: [],
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
              return prev.map(p => p.username === payload.username ? { ...p, ...payload } : p);
            }
            return [...prev, { ...payload, cards: [], shownCards: false }];
          });
          setAnnouncement(`👤 ${payload.username} joined the table!`);
          // Reply with current table state sync
          channel.send({
            type: 'broadcast',
            event: 'SYNC_RESPONSE',
            payload: {
              players: playersRef.current,
              handState: handStateRef.current
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
                  map.set(p.seat_index, { ...p, shownCards: p.shownCards || false });
                }
              }
              return Array.from(map.values());
            });
          }
          if (payload.handState && payload.handState.phase !== 'waiting') {
            setHandState(payload.handState);
          }
        })
        .on('broadcast', { event: 'SEAT_TAKEN' }, ({ payload }) => {
          setPlayers((prev) => {
            if (prev.some(p => p.seat_index === payload.seat_index)) {
              return prev.map(p => p.seat_index === payload.seat_index ? { ...p, ...payload } : p);
            }
            return [...prev, payload];
          });
          setAnnouncement(`👤 ${payload.username} seated at Seat ${payload.seat_index + 1}`);
        })
        .on('broadcast', { event: 'PLAYER_LEFT' }, ({ payload }) => {
          setPlayers((prev) => prev.filter(p => p.username !== payload.username && p.seat_index !== payload.seat_index));
          setAnnouncement(`${payload.username} left the table`);
        })
        .on('broadcast', { event: 'TABLE_STATE_SYNC' }, ({ payload }) => {
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

          // 5. Update handState
          setHandState(payload.handState);

          // 6. Update players while preserving all hole cards for showdown logic
          const isShowdown = payload.handState.phase === 'showdown' || payload.handState.phase === 'ended';

          setPlayers((currentPlayers) => {
            return payload.players.map((incomingP) => {
              const localP = currentPlayers.find((lp) => lp.seat_index === incomingP.seat_index);

              // Maintain card data integrity so showdown and engine have complete hole cards.
              // Opponent cards privacy during active play is strictly enforced in PlayerSeat.jsx.
              const effectiveCards = (incomingP.cards && incomingP.cards.length >= 2)
                ? incomingP.cards
                : (localP?.cards || incomingP.cards || []);

              return {
                ...incomingP,
                cards: effectiveCards,
                shownCards: isShowdown ? Boolean(incomingP.shownCards) : false
              };
            });
          });
        })
        .on('broadcast', { event: 'HAND_DEALT' }, ({ payload }) => {
          if (!payload || !payload.handState) return;
          playCardDeal();
          setHandState(payload.handState);
          setWinningCards([]);
          if (payload.announcement) setAnnouncement(payload.announcement);

          setPlayers((currentPlayers) => {
            return payload.players.map((incomingP) => {
              const localP = currentPlayers.find((lp) => lp.seat_index === incomingP.seat_index);
              const effectiveCards = (incomingP.cards && incomingP.cards.length >= 2)
                ? incomingP.cards
                : (localP?.cards || incomingP.cards || []);

              return {
                ...incomingP,
                cards: effectiveCards,
                shownCards: false
              };
            });
          });
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
          payload: { username: user?.username }
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
  }, [handState.currentTurnSeat, handState.phase]);

  // AI Bot Turn Execution (in Practice mode or when testing with bots)
  useEffect(() => {
    if (handState.phase === 'waiting' || handState.phase === 'ended' || handState.phase === 'showdown') {
      return;
    }

    const activePlayer = players.find((p) => p.seat_index === handState.currentTurnSeat);
    if (!activePlayer || !activePlayer.isBot) {
      return;
    }

    // In multiplayer, only lowest human seat handles bot action
    const humanPlayers = players.filter((p) => !p.isBot);
    const lowestHumanSeat = humanPlayers.reduce((min, p) => Math.min(min, p.seat_index), 999);
    if (mySeatIndex !== lowestHumanSeat && humanPlayers.length > 0) {
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
      chips: gameRoom?.startingStack || 1500,
      current_round_bet: 0,
      total_hand_bet: 0,
      status: 'active',
      last_action: null,
      cards: [],
      shownCards: true,
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

  // Host Adds an AI Bot to fill an open seat
  const handleAddBot = () => {
    const totalMax = Math.max(3, Math.min(8, gameRoom?.maxPlayers || 6));
    if (players.length >= totalMax) {
      alert('Table is full!');
      return;
    }

    const occupiedSeats = players.map(p => p.seat_index);
    let openSeat = 1;
    while (occupiedSeats.includes(openSeat) && openSeat < totalMax) {
      openSeat++;
    }

    const botName = BOT_NAMES[(openSeat - 1) % BOT_NAMES.length];
    const newBot = {
      seat_index: openSeat,
      username: botName,
      chips: gameRoom?.startingStack || 1500,
      current_round_bet: 0,
      total_hand_bet: 0,
      status: 'active',
      last_action: null,
      cards: [],
      shownCards: false,
      isBot: true
    };

    const updated = [...players, newBot];
    setPlayers(updated);
    setAnnouncement(`Added ${botName} to Seat ${openSeat + 1}`);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'SEAT_TAKEN',
        payload: newBot
      });
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
    // Strictly ensure shownCards is false during all active betting rounds
    const sanitizedPlayers = newPlayers.map((p) => ({
      ...p,
      shownCards: isShowdown ? Boolean(p.shownCards) : false
    }));

    setPlayers(sanitizedPlayers);
    setHandState(newHandState);
    if (newAnnouncement) setAnnouncement(newAnnouncement);
    setWinningCards(winCards || []);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'TABLE_STATE_SYNC',
        payload: {
          players: sanitizedPlayers,
          handState: newHandState,
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
    if (!hero || !hero.cards || hero.cards.length === 0) return;
    setHeroShowCardsClicked(true);
    const updated = playersRef.current.map((p) =>
      p.seat_index === mySeatIndexRef.current ? { ...p, shownCards: true } : p
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
          cards: hero.cards
        }
      });
    }
  };

  // Helper: Deck generator
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

  // START HAND (Clockwise Blinds Rotation: Dealer -> SB -> BB -> UTG)
  const startNewHand = () => {
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

    const newHandNum = (handStateRef.current.handNumber || 0) + 1;
    let sbAmount = gameRoom?.smallBlind || 10;
    let bbAmount = gameRoom?.bigBlind || 20;

    // Apply blinds escalation frequency from custom options
    const freq = gameRoom?.blindsFrequency || 'fast_5';
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

    const updatedPlayers = currentPlayers.map((p) => {
      if (p.chips <= 0) return { ...p, status: 'sitting_out', cards: [] };

      const c1 = deck[deckIdx++];
      const c2 = deck[deckIdx++];
      let bet = 0;
      let lastAction = null;

      if (p.seat_index === sbSeat) {
        bet = Math.min(p.chips, sbAmount);
        lastAction = 'small_blind';
      } else if (p.seat_index === bbSeat) {
        bet = Math.min(p.chips, bbAmount);
        lastAction = 'big_blind';
      }

      return {
        ...p,
        chips: p.chips - bet,
        current_round_bet: bet,
        total_hand_bet: bet,
        status: p.chips - bet === 0 ? 'all_in' : 'active',
        last_action: lastAction,
        cards: [c1, c2],
        shownCards: false
      };
    });

    playCardDeal();

    const utgPlayer = updatedPlayers.find((p) => p.seat_index === utgSeat);
    const initialAnnouncement = `Hand #${newHandNum} Dealt • Blinds: ${formatPoints(sbAmount)} / ${formatPoints(bbAmount)} • ${utgPlayer?.username || 'Player'}'s Turn`;

    const newHandState = {
      handNumber: newHandNum,
      phase: 'preflop',
      communityCards: [],
      deck: deck.slice(deckIdx),
      currentTurnSeat: utgSeat,
      dealerSeat: nextDealerSeat,
      sbSeat,
      bbSeat,
      currentBet: bbAmount,
      minRaise: bbAmount,
      mainPot: sbAmount + bbAmount,
      sidePots: [],
      winners: []
    };

    broadcastTableState(updatedPlayers, newHandState, initialAnnouncement, []);
  };

  // Submit Player Action (Hero or local execution)
  const handlePlayerAction = (action, amount = 0) => {
    const currentSeat = handStateRef.current.currentTurnSeat;
    executeActionLogic(action, amount, currentSeat);
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
    let newCommunity = [...currentHandState.communityCards];
    let remainingDeck = [...currentHandState.deck];

    triggerChipsFlight(playersList);
    playCardDeal();

    // Reset round bets
    const resetPlayers = playersList.map((p) => ({
      ...p,
      current_round_bet: 0,
      last_action: p.status === 'folded' ? 'fold' : null
    }));

    if (currentHandState.phase === 'preflop') {
      nextPhase = 'flop';
      remainingDeck.shift(); // burn
      newCommunity.push(remainingDeck.shift(), remainingDeck.shift(), remainingDeck.shift());
    } else if (currentHandState.phase === 'flop') {
      nextPhase = 'turn';
      remainingDeck.shift();
      newCommunity.push(remainingDeck.shift());
    } else if (currentHandState.phase === 'turn') {
      nextPhase = 'river';
      remainingDeck.shift();
      newCommunity.push(remainingDeck.shift());
    } else if (currentHandState.phase === 'river') {
      resolveShowdown(resetPlayers, newCommunity, currentPot, actorInfo);
      return;
    }

    // Check if remaining active contenders can make any further bets (i.e. at least 2 players have chips)
    const canAnyPlayerBet = resetPlayers.filter((p) => p.status === 'active' && p.chips > 0).length > 1;

    // If at most 1 player has chips left (all others are all-in or folded), run out the remaining board cards to showdown
    if (!canAnyPlayerBet && nextPhase !== 'river') {
      while (newCommunity.length < 5 && remainingDeck.length > 0) {
        remainingDeck.shift(); // burn
        newCommunity.push(remainingDeck.shift());
      }
      resolveShowdown(resetPlayers, newCommunity, currentPot, actorInfo);
      return;
    }

    // Postflop action starts with first active player clockwise from Dealer Button
    const firstActor = getNextTurnSeat(currentHandState.dealerSeat, resetPlayers);
    const actorPlayer = resetPlayers.find((p) => p.seat_index === firstActor);

    const nextHandState = {
      ...currentHandState,
      phase: nextPhase,
      communityCards: newCommunity,
      deck: remainingDeck,
      currentBet: 0,
      minRaise: gameRoom?.bigBlind || 20,
      mainPot: currentPot,
      currentTurnSeat: firstActor
    };

    const nextAnnouncement = `${nextPhase.toUpperCase()} Dealt • ${actorPlayer?.username || 'Hero'}'s Turn`;

    broadcastTableState(resetPlayers, nextHandState, nextAnnouncement, [], actorInfo);
  };

  const resolveShowdown = (playersList, communityCards, totalPot, actorInfo) => {
    const contenders = playersList.filter((p) => p.status === 'active' || p.status === 'all_in');

    if (contenders.length === 0) return;

    if (contenders.length === 1) {
      resolveUncontestedWinner(contenders[0], totalPot, playersList, actorInfo);
      return;
    }

    const evaluations = contenders.map((player) => {
      const allCards = [...(player.cards || []), ...communityCards];
      const evaluation = evaluateHand(allCards);
      return { player, evaluation };
    });

    evaluations.sort((a, b) => compareScores(b.evaluation?.score || [0], a.evaluation?.score || [0]));

    const bestScore = evaluations[0]?.evaluation?.score || [0];
    const bestEval = evaluations[0]?.evaluation || { name: 'Winning Hand' };
    const winCards = bestEval.cards || [];

    // All contenders tied for best score
    const winnersList = evaluations.filter(
      (e) => compareScores(e.evaluation?.score || [0], bestScore) === 0
    );

    const splitShare = Math.floor(totalPot / winnersList.length);
    const remainder = totalPot % winnersList.length;

    const revealedPlayers = playersList.map((p) => {
      const isContender = contenders.some((c) => c.seat_index === p.seat_index);
      const winnerIndex = winnersList.findIndex((w) => w.player.seat_index === p.seat_index);

      if (winnerIndex !== -1) {
        const bonus = splitShare + (winnerIndex === 0 ? remainder : 0);
        return {
          ...p,
          chips: p.chips + bonus,
          shownCards: true
        };
      }
      return isContender ? { ...p, shownCards: true } : p;
    });

    let winAnnouncement = '';
    if (winnersList.length > 1) {
      const names = winnersList.map((w) => w.player.username).join(' & ');
      winAnnouncement = `🤝 Split Pot! ${names} each win ${formatPoints(splitShare)} with ${bestEval.name}!`;
    } else {
      const singleWinner = winnersList[0].player;
      winAnnouncement = `🏆 ${singleWinner.username} Wins ${formatPoints(totalPot)} with ${bestEval.name}!`;
    }

    playWinCelebration();
    confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
    setWinningCards(winCards);

    const nextHandState = {
      ...handStateRef.current,
      phase: 'showdown',
      communityCards,
      mainPot: totalPot,
      winners: winnersList.map((w, idx) => ({
        seat_index: w.player.seat_index,
        amount: splitShare + (idx === 0 ? remainder : 0),
        handName: w.evaluation?.name || bestEval.name
      }))
    };

    broadcastTableState(revealedPlayers, nextHandState, winAnnouncement, winCards, actorInfo);
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

    let finalCommunity = [...handStateRef.current.communityCards];
    if (gameRoom?.showRemainingRiverCards && finalCommunity.length < 5) {
      const remainingDeck = [...handStateRef.current.deck];
      const needed = 5 - finalCommunity.length;
      finalCommunity = [...finalCommunity, ...remainingDeck.slice(0, needed)];
    }

    const nextHandState = {
      ...handStateRef.current,
      phase: 'ended',
      communityCards: finalCommunity,
      mainPot: totalPot,
      winners: [{ seat_index: winner.seat_index, amount: totalPot, handName: 'Uncontested' }]
    };

    broadcastTableState(updated, nextHandState, winAnnouncement, [], actorInfo);
  };

  const executeBotTurn = (bot) => {
    const currentHandState = handStateRef.current;
    const toCall = currentHandState.currentBet - bot.current_round_bet;
    const pot = currentHandState.mainPot;
    const potOdds = toCall / (pot + toCall || 1);

    const allCards = [...bot.cards, ...currentHandState.communityCards];
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
    if (handStateRef.current.currentTurnSeat !== mySeatIndexRef.current) return;

    const currentP = playersRef.current.find((p) => p.seat_index === mySeatIndexRef.current);
    if (!currentP) return;

    if (currentP.current_round_bet === handStateRef.current.currentBet) {
      handlePlayerAction('check', 0);
    } else {
      handlePlayerAction('fold', 0);
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
      {/* Top Table Header Bar */}
      <header className="table-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onLeaveTable}
            className="table-nav-btn table-back-btn"
            title="Leave Table"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Lobby</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 900, color: '#ffffff' }}>
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

        {/* Live Announcement Center Marquee */}
        <div className="table-marquee-box">
          <span style={{ color: '#f59e0b', marginRight: '6px' }}>●</span>
          <span>{announcement}</span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isWaitingOrEnded && (
            <>
              {players.length < (gameRoom?.maxPlayers || 6) && (
                <button
                  onClick={handleAddBot}
                  className="table-nav-btn"
                  style={{ background: '#1e293b', borderColor: '#475569' }}
                  title="Add Practice Bot"
                >
                  <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                  <span>+ Bot</span>
                </button>
              )}

              <button
                onClick={startNewHand}
                className="table-nav-btn"
                style={{ background: '#059669', borderColor: '#34d399', color: '#ffffff', fontWeight: 900 }}
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{handState.handNumber === 0 ? 'Deal Hand' : 'Next Hand'}</span>
              </button>
            </>
          )}

          <button
            onClick={() => setFeltTheme(feltTheme === 'emerald' ? 'midnight' : 'emerald')}
            className="table-nav-btn"
            title="Toggle Felt Color"
          >
            {feltTheme === 'emerald' ? '🟢 Velvet' : '🔵 Dark'}
          </button>

          <button
            onClick={() => setSoundOn(toggleSound())}
            className="table-nav-btn"
            title="Toggle Audio"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
        </div>
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

              {/* Seated Players: Positioned on the OUTER RAIL of the table */}
              {players.map((player) => {
                const totalSeats = Math.max(players.length, gameRoom?.maxPlayers || 6);
                const pos = getSeatCoordinates(player.seat_index, totalSeats, mySeatIndex);
                const isWinner = handState.winners.some((w) => w.seat_index === player.seat_index);

                return (
                  <PlayerSeat
                    key={player.seat_index}
                    player={player}
                    seatIndex={player.seat_index}
                    position={pos}
                    isHero={player.seat_index === mySeatIndex}
                    isHandEnded={isWaitingOrEnded}
                    isDealer={player.seat_index === handState.dealerSeat}
                    isSB={player.seat_index === handState.sbSeat}
                    isBB={player.seat_index === handState.bbSeat}
                    isCurrentTurn={player.seat_index === handState.currentTurnSeat && !isWaitingOrEnded}
                    turnTimeLeft={turnTimeLeft}
                    turnMaxTime={turnMaxTime}
                    isWinner={isWinner}
                    winningCards={winningCards}
                    onSit={handleSitAtSeat}
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
          bigBlind={gameRoom?.bigBlind || 20}
          mainPot={handState.mainPot}
          handRank={heroHandRank}
          turnTimeLeft={turnTimeLeft}
          turnMaxTime={turnMaxTime}
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
              <span style={{ fontSize: '11px', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {handState.handNumber === 0 ? 'TABLE READY' : 'HAND COMPLETED'}
              </span>
              <span style={{ fontSize: '11px', color: '#cbd5e1' }}>•</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
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

              {players.length < (gameRoom?.maxPlayers || 6) && (
                <button
                  type="button"
                  onClick={handleAddBot}
                  className="table-nav-btn"
                  style={{ background: '#1e293b', borderColor: '#475569', padding: '8px 12px' }}
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
    </div>
  );
};
