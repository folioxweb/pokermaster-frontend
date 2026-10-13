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
  Users,
  Sun,
  Moon,
  Trophy,
  Crown,
  Settings,
  Layers,
  ShieldAlert,
  Flame,
  Clock,
  Sparkles,
  Share2,
  Link,
  ChevronDown,
  Mail,
  Zap
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getSeatCoordinates } from '../lib/seatingMath';
import { formatPoints } from '../lib/formatters';
import {
  playCardDeal,
  playCheckKnock,
  playFold,
  playTimerAlert,
  playWinCelebration,
  toggleSound,
  isSoundEnabled
} from '../lib/soundEffects';
import {
  BLUFF_RANKS,
  RANK_NAMES,
  createBluffDeck,
  dealBluffCards,
  getNextClaimRank,
  verifyPlay,
  decideBotPlay,
  decideBotCallBluff,
  sortHand
} from '../lib/bluffEngine';
import { CardAsset } from './CardAsset';

const BOT_NAMES = ['Viper', 'AceHigh', 'BluffKing', 'Maverick', 'ChipLeader', 'LadyLuck', 'RiverRat'];

export const BluffTable = ({
  gameRoom,
  user,
  onLeaveTable,
  onOpenSocial = null,
  onlineCount = 1,
  theme = 'dark',
  onToggleTheme = null
}) => {
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [copiedCode, setCopiedCode] = useState(false);
  const [feltTheme, setFeltTheme] = useState('midnight');

  const [mySeatIndex, setMySeatIndex] = useState(0);
  const [players, setPlayers] = useState([]);
  const [myHand, setMyHand] = useState([]);
  const [selectedCardIndices, setSelectedCardIndices] = useState([]);
  const [heroClaimRank, setHeroClaimRank] = useState('A');

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Bluff Match State
  const [matchState, setMatchState] = useState({
    handNumber: 0,
    phase: 'waiting', // 'waiting' | 'playing' | 'challenge_window' | 'showdown' | 'ended'
    currentTurnSeat: 0,
    lastPlaySeat: null,
    lastPlayedCardsCount: 0,
    lastPlayedCards: [], // Private until challenged
    currentClaimRank: 'A',
    trickClaimRank: null, // Locked rank for the current trick (null when new trick starts)
    consecutivePasses: 0, // Count of consecutive passes since last card play
    burnedCardsCount: 0, // Cards permanently cleared out of the game
    discardPile: [],
    deckType: gameRoom?.deckType || 'single', // 'single' (54) | 'double' (108)
    passAllowed: false, // Cannot pass on opening lead of a trick
    challengeTime: gameRoom?.challengeTime ?? 8, // seconds for challenge window (0 = no limit)
    challengeRule: gameRoom?.challengeRule || 'anyone', // 'anyone' | 'next_only'
    winner: null
  });

  const [challengeTimeLeft, setChallengeTimeLeft] = useState(0);
  const [challengeResult, setChallengeResult] = useState(null); // { challenger, target, isBluff, cards }
  const [announcement, setAnnouncement] = useState('Welcome to Bluff Master • Waiting to deal');
  const [isWaitingLobbyMinimized, setIsWaitingLobbyMinimized] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const channelRef = useRef(null);
  const challengeTimerRef = useRef(null);
  const botChallengeTimerRef = useRef(null);
  const challengeLockRef = useRef(false);
  const playersRef = useRef(players);
  const matchStateRef = useRef(matchState);
  const myHandRef = useRef(myHand);
  const [selectedRank, setSelectedRank] = useState(null);

  const isCreator = (gameRoom?.host_username || gameRoom?.hostUsername) === user?.username || Boolean(gameRoom?.isHost) || Boolean(gameRoom?.isPractice) || !gameRoom?.host_username;
  const isCreatorRef = useRef(isCreator);
  const mySeatIndexRef = useRef(mySeatIndex);

  useEffect(() => {
    isCreatorRef.current = isCreator;
  }, [isCreator]);

  useEffect(() => {
    mySeatIndexRef.current = mySeatIndex;
  }, [mySeatIndex]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    matchStateRef.current = matchState;
  }, [matchState]);

  useEffect(() => {
    myHandRef.current = myHand;
  }, [myHand]);

  // Initialize Seated Players (Practice Mode vs Live Multiplayer)
  useEffect(() => {
    let isMounted = true;
    const totalMax = Math.max(2, Math.min(8, gameRoom?.maxPlayers || 6));

    if (gameRoom?.isPractice) {
      const initial = [
        {
          seat_index: 0,
          user_id: user?.id,
          username: user?.username || 'Hero',
          cardCount: 0,
          cards: [],
          status: 'active',
          isBot: false
        }
      ];
      for (let i = 1; i < totalMax; i++) {
        initial.push({
          seat_index: i,
          username: BOT_NAMES[i - 1] || `Bot ${i + 1}`,
          cardCount: 0,
          cards: [],
          status: 'active',
          isBot: true
        });
      }
      if (isMounted) {
        setMySeatIndex(0);
        setPlayers(initial);
        setAnnouncement(`Practice Mode (${totalMax} Players) • Ready to deal cards`);
      }
      return;
    }

    // Multiplayer room setup with Supabase Realtime Broadcast
    const initMultiplayer = async () => {
      let initial = [
        {
          seat_index: 0,
          user_id: user?.id,
          username: user?.username || 'Hero',
          cardCount: 0,
          cards: [],
          status: 'active',
          isBot: false
        }
      ];
      if (isMounted) {
        setMySeatIndex(0);
        setPlayers(initial);
      }

      // Realtime channel
      const roomCode = gameRoom?.roomCode || 'BL-SOLO';
      const channel = supabase.channel(`bluff_room_${roomCode}`, {
        config: { broadcast: { self: false } }
      });

      channel
        .on('broadcast', { event: 'BLUFF_PLAYER_JOINED' }, ({ payload }) => {
          if (!payload || payload.username === user?.username) return;
          setPlayers((prev) => {
            if (prev.some((p) => p.username === payload.username)) return prev;
            const openSeats = prev.map((p) => p.seat_index);
            let targetSeat = payload.seat_index ?? 1;
            while (openSeats.includes(targetSeat) && targetSeat < 8) {
              targetSeat++;
            }
            const newP = {
              seat_index: targetSeat,
              user_id: payload.user_id,
              username: payload.username,
              cardCount: 0,
              cards: [],
              status: 'active',
              isBot: false
            };
            const updated = [...prev, newP];

            // Host responds by syncing full roster and table settings to everyone
            if (isCreatorRef.current && channelRef.current) {
              channelRef.current.send({
                type: 'broadcast',
                event: 'BLUFF_ROSTER_SYNC',
                payload: {
                  players: updated.map((p) => ({ ...p, cards: [] })),
                  matchState: matchStateRef.current
                }
              });
            }
            return updated;
          });
          setAnnouncement(`👋 ${payload.username} joined the table!`);
        })
        .on('broadcast', { event: 'BLUFF_ROSTER_SYNC' }, ({ payload }) => {
          if (!payload) return;
          if (payload.players) {
            setPlayers((prev) => {
              const myEntry = payload.players.find((p) => p.username === user?.username);
              if (myEntry) setMySeatIndex(myEntry.seat_index);
              return payload.players.map((p) => ({
                ...p,
                cards: p.seat_index === (myEntry?.seat_index ?? mySeatIndexRef.current) ? myHandRef.current : (p.isBot ? (p.cards || []) : [])
              }));
            });
          }
          if (payload.matchState) {
            setMatchState((prev) => ({
              ...prev,
              deckType: payload.matchState.deckType ?? prev.deckType,
              challengeRule: payload.matchState.challengeRule ?? prev.challengeRule,
              challengeTime: payload.matchState.challengeTime ?? prev.challengeTime
            }));
          }
        })
        .on('broadcast', { event: 'BLUFF_BOT_ADDED' }, ({ payload }) => {
          if (!payload?.botPlayer) return;
          setPlayers((prev) => {
            if (prev.some((p) => p.seat_index === payload.botPlayer.seat_index)) return prev;
            return [...prev, payload.botPlayer];
          });
          setAnnouncement(`🤖 Added ${payload.botPlayer.username} to Seat ${payload.botPlayer.seat_index + 1}`);
        })
        .on('broadcast', { event: 'BLUFF_PLAYER_REMOVED' }, ({ payload }) => {
          if (!payload) return;
          if (payload.username === user?.username) {
            alert('You were removed from the table by the host.');
            onLeaveTable();
            return;
          }
          setPlayers((prev) => prev.filter((p) => p.seat_index !== payload.seat_index));
          setAnnouncement(`${payload.username} left the table.`);
        })
        .on('broadcast', { event: 'BLUFF_SETTINGS_SYNC' }, ({ payload }) => {
          if (!payload?.settings) return;
          setMatchState((prev) => ({ ...prev, ...payload.settings }));
          setAnnouncement('⚙️ Table settings updated.');
        })
        .on('broadcast', { event: 'BLUFF_MATCH_STARTED' }, ({ payload }) => {
          if (!payload) return;
          playCardDeal();
          const myCards = payload.seatCards?.[mySeatIndexRef.current] || [];
          setMyHand(myCards);
          setSelectedCardIndices([]);
          setChallengeResult(null);

          const synchedPlayers = payload.players.map((p) => ({
            ...p,
            cards: p.seat_index === mySeatIndexRef.current ? myCards : (p.isBot ? (payload.seatCards?.[p.seat_index] || []) : [])
          }));

          setPlayers(synchedPlayers);
          setMatchState(payload.matchState);
          if (payload.announcement) setAnnouncement(payload.announcement);
        })
        .on('broadcast', { event: 'BLUFF_STATE_SYNC' }, ({ payload }) => {
          if (!payload) return;
          if (payload.matchState) setMatchState(payload.matchState);
          if (payload.announcement) setAnnouncement(payload.announcement);
          if (payload.players) {
            setPlayers((prev) =>
              payload.players.map((p) => ({
                ...p,
                cards: p.seat_index === mySeatIndexRef.current ? myHandRef.current : (p.isBot ? (p.cards || []) : [])
              }))
            );
          }
          if (payload.challengeResult) setChallengeResult(payload.challengeResult);
        })
        .on('broadcast', { event: 'BLUFF_CHALLENGE_CALLED' }, ({ payload }) => {
          challengeLockRef.current = true;
          if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
          if (botChallengeTimerRef.current) clearTimeout(botChallengeTimerRef.current);
          setChallengeTimeLeft(0);
          playCheckKnock();
          if (payload?.challengeResult) setChallengeResult(payload.challengeResult);
          if (payload?.matchState) setMatchState(payload.matchState);
          setAnnouncement(`🚨 ${payload.challenger} CALLED BLUFF on ${payload.target}!`);
        })
        .on('broadcast', { event: 'BLUFF_MATCH_VICTORY' }, ({ payload }) => {
          playWinCelebration();
          confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });
          if (payload?.matchState) setMatchState(payload.matchState);
          if (payload?.announcement) setAnnouncement(payload.announcement);
        });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: 'BLUFF_PLAYER_JOINED',
            payload: {
              username: user?.username || 'Hero',
              user_id: user?.id,
              seat_index: 0
            }
          });
        }
      });

      channelRef.current = channel;
    };

    initMultiplayer();

    return () => {
      isMounted = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [gameRoom, user]);

  // Add Practice Bot into Table
  const handleAddBot = () => {
    const totalMax = Math.max(2, Math.min(8, gameRoom?.maxPlayers || 6));
    if (players.length >= totalMax) {
      alert('Table is full!');
      return;
    }

    const occupied = players.map((p) => p.seat_index);
    let openSeat = 1;
    while (occupied.includes(openSeat) && openSeat < totalMax) {
      openSeat++;
    }

    const botName = BOT_NAMES[(openSeat - 1) % BOT_NAMES.length];
    const newBot = {
      seat_index: openSeat,
      username: botName,
      cardCount: 0,
      cards: [],
      status: 'active',
      isBot: true
    };

    const updated = [...players, newBot];
    setPlayers(updated);
    setAnnouncement(`🤖 Added ${botName} to Seat ${openSeat + 1}`);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_BOT_ADDED',
        payload: { botPlayer: newBot }
      });
    }
  };

  // Remove Player or Bot from Table (Host only)
  const handleRemovePlayer = (pToRemove) => {
    const updated = players.filter((p) => p.seat_index !== pToRemove.seat_index);
    setPlayers(updated);
    setAnnouncement(`Removed ${pToRemove.username} from table`);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_PLAYER_REMOVED',
        payload: { username: pToRemove.username, seat_index: pToRemove.seat_index }
      });
    }
  };

  // Live Sync Settings (Host & Waiting Lobby)
  const handleUpdateSetting = (newSettings) => {
    const updated = { ...matchState, ...newSettings };
    setMatchState(updated);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_SETTINGS_SYNC',
        payload: { settings: newSettings }
      });
    }
  };

  // Copy / Share Direct Invite Link
  const handleShareInviteLink = () => {
    const roomCode = gameRoom?.roomCode || 'BL-SOLO';
    const url = `${window.location.origin}/?room=${roomCode}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setInviteLinkCopied(true);
      setAnnouncement('📋 Invite link copied to clipboard! Share with friends to join.');
      setTimeout(() => setInviteLinkCopied(false), 2500);
    }
  };

  // Deal New Bluff Hand & Start Match
  const startNewBluffMatch = () => {
    if (players.length < 2) {
      alert('Need at least 2 players to start a Bluff match! Add a practice bot or invite friends.');
      return;
    }

    playCardDeal();
    const currentList = [...playersRef.current];
    const deck = createBluffDeck(matchState.deckType);
    const hands = dealBluffCards(deck, currentList.length);

    const seatCards = {};
    currentList.forEach((p, idx) => {
      seatCards[p.seat_index] = hands[idx];
    });

    const updatedPlayers = currentList.map((p, idx) => ({
      ...p,
      cardCount: hands[idx].length,
      cards: idx === mySeatIndex ? hands[idx] : (p.isBot ? hands[idx] : []),
      status: 'active'
    }));

    setMyHand(hands[mySeatIndex] || []);
    setSelectedCardIndices([]);
    setChallengeResult(null);

    // Pick any random player to start the match!
    const startingSeat = Math.floor(Math.random() * updatedPlayers.length);
    const starter = updatedPlayers[startingSeat];

    const newMatch = {
      ...matchState,
      handNumber: matchState.handNumber + 1,
      phase: 'playing',
      currentTurnSeat: startingSeat,
      lastPlaySeat: null,
      lastPlayedCardsCount: 0,
      lastPlayedCards: [],
      currentClaimRank: 'A',
      trickClaimRank: null, // Reset for new trick
      consecutivePasses: 0,
      burnedCardsCount: 0,
      discardPile: [],
      passAllowed: false, // Leader must lead cards
      winner: null
    };

    setMatchState(newMatch);
    setPlayers(updatedPlayers);
    const msg = `🃏 Dealt ${deck.length} cards! ${starter?.username} gets the chance to start! Lead with any rank & cards.`;
    setAnnouncement(msg);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_MATCH_STARTED',
        payload: {
          players: updatedPlayers.map((p) => ({ ...p, cards: [] })),
          seatCards,
          matchState: newMatch,
          announcement: msg
        }
      });
    }
  };

  // Broadcast helper
  const broadcastState = (newPlayers, newMatch, announce) => {
    if (channelRef.current) {
      const sanitizedPlayers = newPlayers.map((p) => ({
        ...p,
        cards: [] // Zero-knowledge: opponents cards never broadcasted
      }));
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_STATE_SYNC',
        payload: {
          players: sanitizedPlayers,
          matchState: { ...newMatch, lastPlayedCards: [] },
          announcement: announce
        }
      });
    }
  };

  // Turn Action: Play Cards
  const handlePlayCards = (cardsToPlay, isHero = true, claimedRankOverride = null) => {
    if (cardsToPlay.length === 0) {
      alert('You must select at least 1 card to play.');
      return;
    }

    playCardDeal();
    const activeSeat = matchState.currentTurnSeat;
    // If trickClaimRank is locked, subsequent players must play as that rank!
    // If trickClaimRank is null, opening play sets and locks the rank for this trick!
    const effectiveClaimRank = matchState.trickClaimRank !== null
      ? matchState.trickClaimRank
      : (claimedRankOverride || (isHero ? heroClaimRank : matchState.currentClaimRank));

    if (isHero && matchState.trickClaimRank === null) {
      setHeroClaimRank(effectiveClaimRank);
    }

    // Remove played cards from player's hand
    let updatedPlayers = players.map((p) => {
      if (p.seat_index === activeSeat) {
        let remainingCards = p.cards;
        if (isHero) {
          remainingCards = myHand.filter((c, idx) => !selectedCardIndices.includes(idx));
          setMyHand(remainingCards);
          setSelectedCardIndices([]);
        } else if (p.isBot) {
          const toRemove = [...cardsToPlay];
          remainingCards = p.cards.filter((c) => {
            const index = toRemove.indexOf(c);
            if (index !== -1) {
              toRemove.splice(index, 1);
              return false;
            }
            return true;
          });
        }
        return {
          ...p,
          cards: remainingCards,
          cardCount: Math.max(0, p.cardCount - cardsToPlay.length)
        };
      }
      return p;
    });

    const activePlayer = players.find((p) => p.seat_index === activeSeat);
    const claimMsg = `${activePlayer?.username} plays ${cardsToPlay.length} ${RANK_NAMES[effectiveClaimRank] || effectiveClaimRank}!`;
    setAnnouncement(claimMsg);

    // Add cards to central discard pile (held face down)
    const newPile = [...matchState.discardPile, ...cardsToPlay];

    // Check if player emptied their hand!
    const emptiedHand = (isHero ? myHand.length - cardsToPlay.length === 0 : activePlayer.cardCount - cardsToPlay.length === 0);

    const nextState = {
      ...matchState,
      phase: 'challenge_window',
      lastPlaySeat: activeSeat,
      lastPlayedCardsCount: cardsToPlay.length,
      lastPlayedCards: cardsToPlay,
      currentClaimRank: effectiveClaimRank,
      trickClaimRank: effectiveClaimRank, // LOCKED for this entire trick!
      consecutivePasses: 0, // Reset passes counter since a card was played
      passAllowed: true, // Now subsequent players can pass or play
      discardPile: newPile,
      winner: emptiedHand ? activePlayer : null
    };

    setMatchState(nextState);
    setPlayers(updatedPlayers);
    broadcastState(updatedPlayers, nextState, claimMsg);

    // Start challenge window countdown (default to 8 seconds so players have ample reaction time)
    const winTime = matchState.challengeTime > 0 ? matchState.challengeTime : 8;
    setChallengeTimeLeft(winTime);

    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    challengeTimerRef.current = setInterval(() => {
      setChallengeTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(challengeTimerRef.current);
          handleChallengeTimeout(matchStateRef.current, playersRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Challenge Window Expired or Passed Without Anyone Calling Bluff
  const handleChallengeTimeout = (stateToAdvance = null, currentPlayersList = null) => {
    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    const activeState = stateToAdvance || matchStateRef.current;
    const activePlayers = currentPlayersList || playersRef.current;

    if (activeState.phase !== 'challenge_window') return;

    // If last player emptied their hand and wasn't challenged, they WIN!
    const lastP = activePlayers.find((p) => p.seat_index === activeState.lastPlaySeat);
    const lastPCount = activeState.lastPlaySeat === mySeatIndexRef.current
      ? myHandRef.current.length
      : (lastP?.cardCount ?? (lastP?.cards?.length ?? 1));

    if (activeState.winner || lastPCount === 0) {
      handleMatchVictory(activeState.winner || lastP);
      return;
    }

    // Advance to next player in clockwise order (MUST play trickClaimRank or Pass)
    const totalPlayers = activePlayers.length;
    let nextSeat = (activeState.lastPlaySeat + 1) % totalPlayers;

    const advancedState = {
      ...activeState,
      phase: 'playing',
      currentTurnSeat: nextSeat,
      lastPlayedCards: []
    };

    setMatchState(advancedState);
    const nextP = activePlayers.find((p) => p.seat_index === nextSeat);
    const lockedRankName = RANK_NAMES[activeState.trickClaimRank] || activeState.trickClaimRank;
    const msg = `✅ Nobody called bluff! Turn passes to ${nextP?.username}. (Must play ${lockedRankName}s or Pass)`;
    setAnnouncement(msg);
    broadcastState(activePlayers, advancedState, msg);
  };

  // Turn Action: Pass Turn
  // When everyone passes consecutively after a card play, cards in pile are CLEARED OUT OF THE GAME!
  // And the player who played last gets the chance to start the new trick!
  const handlePassTurn = (passingSeat) => {
    playFold();
    const activeState = matchStateRef.current;
    const currentPlayers = playersRef.current;
    const totalPlayers = currentPlayers.length;
    const passingPlayer = currentPlayers.find((p) => p.seat_index === passingSeat);

    const newPassCount = activeState.consecutivePasses + 1;

    // Check if everyone else passed after the last play:
    // When consecutive passes reaches totalPlayers - 1, everyone has passed!
    if (newPassCount >= totalPlayers - 1 && activeState.lastPlaySeat !== null) {
      const clearedPileCount = activeState.discardPile.length;
      const lastPlayer = currentPlayers.find((p) => p.seat_index === activeState.lastPlaySeat);
      const lastPCount = activeState.lastPlaySeat === mySeatIndexRef.current
        ? myHandRef.current.length
        : (lastPlayer?.cardCount ?? (lastPlayer?.cards?.length ?? 1));

      // If the player who played last has 0 cards, their play survived everyone passing! THEY WIN!
      if (lastPCount === 0) {
        handleMatchVictory(lastPlayer);
        return;
      }

      // ALL CARDS IN DISCARD PILE ARE CLEARED OUT OF THE GAME!
      // AND THE PLAYER WHO PLAYED LAST GETS THE CHANCE!
      const newMatch = {
        ...activeState,
        phase: 'playing',
        currentTurnSeat: activeState.lastPlaySeat, // The player who played last gets the chance!
        lastPlaySeat: null,
        lastPlayedCardsCount: 0,
        lastPlayedCards: [],
        trickClaimRank: null, // Reset trick rank! Leader can choose ANY rank!
        currentClaimRank: 'A',
        discardPile: [], // Cards permanently out of the game!
        burnedCardsCount: (activeState.burnedCardsCount || 0) + clearedPileCount,
        consecutivePasses: 0,
        passAllowed: false // Leader cannot pass on opening lead
      };

      setMatchState(newMatch);
      const winMsg = `🗑️ Everyone passed! All ${clearedPileCount} cards in the pile are OUT OF THE GAME! ${lastPlayer?.username} played last and gets the chance to start a new trick!`;
      setAnnouncement(winMsg);
      broadcastState(currentPlayers, newMatch, winMsg);
    } else {
      // Not everyone passed yet: advance turn to next player in clockwise rotation
      const nextSeat = (passingSeat + 1) % totalPlayers;
      const nextP = currentPlayers.find((p) => p.seat_index === nextSeat);

      const newMatch = {
        ...activeState,
        currentTurnSeat: nextSeat,
        consecutivePasses: newPassCount
      };

      setMatchState(newMatch);
      const rankName = RANK_NAMES[activeState.trickClaimRank] || activeState.trickClaimRank;
      const passMsg = `⏭️ ${passingPlayer?.username} passed. Turn moves to ${nextP?.username} (Must play ${rankName}s or Pass).`;
      setAnnouncement(passMsg);
      broadcastState(currentPlayers, newMatch, passMsg);
    }
  };

  // Immediate Pass / Accept Challenge
  const handlePassChallenge = () => {
    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    setChallengeTimeLeft(0);
    handleChallengeTimeout(matchStateRef.current, playersRef.current);
  };

  // Toggle Challenge Rule ('anyone' vs 'next_only') on the fly
  const handleToggleChallengeRule = () => {
    const nextRule = matchState.challengeRule === 'anyone' ? 'next_only' : 'anyone';
    const updatedMatch = { ...matchState, challengeRule: nextRule };
    setMatchState(updatedMatch);
    const msg = `Mode changed: ${nextRule === 'anyone' ? '⚡ Anyone Can Call Bluff' : '👉 Only Next Person Can Call'}`;
    setAnnouncement(msg);
    broadcastState(players, updatedMatch, msg);
  };

  // Sort Hand by Rank
  const handleSortHand = () => {
    const sorted = sortHand(myHand);
    setMyHand(sorted);
    setSelectedCardIndices([]);
    setSelectedRank(null);
  };

  // Select All Cards of Given Rank (DO NOT SELECT JOKERS per Requirement 3)
  const handleSelectAllOfRank = (rankToSelect) => {
    if (!rankToSelect) return;
    const matching = [];
    myHand.forEach((c, idx) => {
      if (c === 'Jr' || c === 'Jb') return; // NEVER SELECT JOKERS
      const cRank = c.length === 3 ? '10' : c[0];
      if (cRank === rankToSelect) {
        matching.push(idx);
      }
    });

    if (matching.length === 0) return;

    // Toggle: if already all matching are selected, deselect; otherwise select up to 4
    const allSelected = matching.every((idx) => selectedCardIndices.includes(idx));
    if (allSelected) {
      setSelectedCardIndices((prev) => prev.filter((idx) => !matching.includes(idx)));
      setSelectedRank(null);
    } else {
      const toSelect = matching.slice(0, 4);
      setSelectedCardIndices(toSelect);
      setSelectedRank(rankToSelect);
      if (!matchState.trickClaimRank) {
        setHeroClaimRank(rankToSelect);
      }
    }
  };

  // Auto-Select Cards Matching Current Claim Rank (Excludes Jokers)
  const handleAutoSelectCurrentRank = () => {
    handleSelectAllOfRank(matchState.trickClaimRank || heroClaimRank);
  };

  // Action: Call Bluff!
  // First-Come-First-Served Atomic Mutex: Only one player can call bluff at a time!
  const handleCallBluff = (challengerSeat) => {
    if (challengeLockRef.current) return;
    if (matchStateRef.current.phase !== 'challenge_window') return;
    challengeLockRef.current = true;

    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    if (botChallengeTimerRef.current) clearTimeout(botChallengeTimerRef.current);
    setChallengeTimeLeft(0);
    playCheckKnock();

    const currentState = matchStateRef.current;
    const currentPlayers = playersRef.current;
    const blufferSeat = currentState.lastPlaySeat;
    const bluffer = currentPlayers.find((p) => p.seat_index === blufferSeat);
    const challenger = currentPlayers.find((p) => p.seat_index === challengerSeat);

    const playedCards = currentState.lastPlayedCards || [];
    const claimedRank = currentState.trickClaimRank || currentState.currentClaimRank;

    // Verify truth or bluff with wildcard Jokers
    const { isBluff, legalCards, bluffCards } = verifyPlay(playedCards, claimedRank);

    // Turn & Penalty Rules:
    // 1. If challenger is RIGHT (it was a bluff):
    //    - Bluffer was caught bluffing and picks up whole pile!
    //    - Challenger gets the turn to play next!
    // 2. If challenger is WRONG (bluffer told the truth):
    //    - Challenger was wrong and picks up whole pile!
    //    - The player who played last (bluffer) gets the turn to play next!
    const loserSeat = isBluff ? blufferSeat : challengerSeat;
    const loser = isBluff ? bluffer : challenger;
    const nextStarterSeat = isBluff ? challengerSeat : blufferSeat;

    const wholePile = currentState.discardPile || [];
    const isSingleDeck = (currentState.deckType || gameRoom?.deckType || 'single') === 'single';

    const updatedPlayers = currentPlayers.map((p) => {
      if (p.seat_index === loserSeat) {
        let combinedHand = [];
        if (p.seat_index === mySeatIndexRef.current) {
          const raw = [...myHandRef.current, ...wholePile];
          combinedHand = isSingleDeck ? Array.from(new Set(raw)) : raw;
          setMyHand(sortHand(combinedHand));
        } else if (p.isBot) {
          const raw = [...(p.cards || []), ...wholePile];
          combinedHand = isSingleDeck ? Array.from(new Set(raw)) : raw;
        } else {
          combinedHand = [];
        }

        const sortedHand = sortHand(combinedHand);
        return {
          ...p,
          cards: sortedHand,
          cardCount: isSingleDeck ? sortedHand.length : (p.cardCount + wholePile.length)
        };
      }
      return p;
    });

    const result = {
      challenger: challenger?.username,
      target: bluffer?.username,
      isBluff,
      cards: playedCards,
      pileCount: wholePile.length,
      loser: loser?.username
    };

    // Transition immediately to showdown so no other player or bot can act
    const showdownState = {
      ...currentState,
      phase: 'showdown',
      discardPile: [] // Pile picked up by loser
    };

    setChallengeResult(result);
    setPlayers(updatedPlayers);
    setMatchState(showdownState);

    const announcementMsg = isBluff
      ? `🚨 CAUGHT! ${challenger?.username} CALLED BLUFF! ${bluffer?.username} bluffed and picks up ${wholePile.length} cards!`
      : `✨ INNOCENT! ${bluffer?.username} told the truth! ${challenger?.username} was wrong and picks up ${wholePile.length} cards!`;
    setAnnouncement(announcementMsg);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_CHALLENGE_CALLED',
        payload: {
          challenger: challenger?.username,
          target: bluffer?.username,
          challengeResult: result,
          matchState: showdownState
        }
      });
    }

    // Show reveal modal for 4.5 seconds, then declare victory or winner leads new trick
    setTimeout(() => {
      setChallengeResult(null);
      challengeLockRef.current = false;

      // 1. VICTORY CHECK: Did the bluffer survive truthfully with 0 cards?
      if (!isBluff) {
        const blufferP = playersRef.current.find((p) => p.seat_index === blufferSeat);
        const blufferCount = blufferSeat === mySeatIndexRef.current
          ? myHandRef.current.length
          : (blufferP?.cardCount ?? (blufferP?.cards?.length ?? 1));

        if (blufferCount === 0) {
          handleMatchVictory(blufferP || bluffer);
          return;
        }
      }

      const starter = playersRef.current.find((p) => p.seat_index === nextStarterSeat);
      const nextMatch = {
        ...matchStateRef.current,
        phase: 'playing',
        currentTurnSeat: nextStarterSeat,
        trickClaimRank: null, // Winner leads new trick with any rank & cards!
        lastPlaySeat: null,
        lastPlayedCardsCount: 0,
        lastPlayedCards: [],
        discardPile: [],
        consecutivePasses: 0,
        passAllowed: false // Leader must lead cards
      };
      setMatchState(nextMatch);
      const winMsg = isBluff
        ? `🎯 ${challenger?.username} was RIGHT and gets the turn to lead with any rank & cards!`
        : `🛡️ ${bluffer?.username} played truthfully and gets the turn to lead with any rank & cards!`;
      setAnnouncement(winMsg);
      broadcastState(playersRef.current, nextMatch, winMsg);
    }, 4500);
  };

  // Bot Turn & Challenge Automation
  useEffect(() => {
    // 1. Bot Playing Cards on Turn
    if (matchState.phase === 'playing') {
      const activeP = players.find((p) => p.seat_index === matchState.currentTurnSeat);
      if (activeP && activeP.isBot) {
        const timer = setTimeout(() => {
          const decision = decideBotPlay(
            activeP.cards,
            matchState.trickClaimRank,
            matchState.passAllowed,
            matchState.discardPile.length
          );
          if (decision.action === 'pass') {
            handlePassTurn(activeP.seat_index);
          } else {
            handlePlayCards(decision.cards, false, decision.claimedRank);
          }
        }, 1600);
        return () => clearTimeout(timer);
      }
    }

    // 2. Challenge Window Reaction
    if (matchState.phase === 'challenge_window') {
      const currentRule = matchState.challengeRule || 'anyone';
      const totalP = players.length;
      const nextSeat = matchState.lastPlaySeat !== null && totalP > 0
        ? (matchState.lastPlaySeat + 1) % totalP
        : null;

      const lastPlayer = players.find((p) => p.seat_index === matchState.lastPlaySeat);
      const lastPlayerCardCount = lastPlayer
        ? (lastPlayer.seat_index === mySeatIndex ? myHand.length : lastPlayer.cardCount)
        : 10;
      const activeRank = matchState.trickClaimRank || matchState.currentClaimRank;

      // Mode A: NEXT PLAYER ONLY
      if (currentRule === 'next_only') {
        // If Hero is the next player, bots must NEVER challenge! Hero has 100% exclusive authority.
        if (nextSeat === mySeatIndex) {
          return;
        }

        // If next player is a Bot, ONLY that bot evaluates challenge or accept
        const nextBot = players.find((p) => p.seat_index === nextSeat && p.isBot);
        if (nextBot) {
          const wantsToCall = decideBotCallBluff(
            nextBot.cards,
            activeRank,
            matchState.lastPlayedCardsCount,
            matchState.discardPile.length,
            matchState.deckType,
            lastPlayerCardCount
          );

          if (botChallengeTimerRef.current) clearTimeout(botChallengeTimerRef.current);
          botChallengeTimerRef.current = setTimeout(() => {
            if (wantsToCall) {
              handleCallBluff(nextBot.seat_index);
            } else {
              // Bot accepts! Immediately advance to bot's turn to play
              handlePassChallenge();
            }
          }, 1600);
          return () => {
            if (botChallengeTimerRef.current) clearTimeout(botChallengeTimerRef.current);
          };
        }
        return;
      }

      // Mode B: ANYONE CAN CALL
      // If Hero can call bluff, give Hero priority with 3.8s-5.2s bot delay so bots don't snipe!
      const heroCanCall = matchState.lastPlaySeat !== mySeatIndex;
      const eligibleBots = players.filter((p) => p.isBot && p.seat_index !== matchState.lastPlaySeat);

      for (const bot of eligibleBots) {
        const wantsToCall = decideBotCallBluff(
          bot.cards,
          activeRank,
          matchState.lastPlayedCardsCount,
          matchState.discardPile.length,
          matchState.deckType,
          lastPlayerCardCount
        );

        if (wantsToCall) {
          const delay = heroCanCall
            ? Math.floor(Math.random() * 1400) + 3800 // Hero has 3.8s+ to react!
            : Math.floor(Math.random() * 1400) + 1800;

          if (botChallengeTimerRef.current) clearTimeout(botChallengeTimerRef.current);
          botChallengeTimerRef.current = setTimeout(() => {
            handleCallBluff(bot.seat_index);
          }, delay);
          return () => {
            if (botChallengeTimerRef.current) clearTimeout(botChallengeTimerRef.current);
          };
        }
      }
    }
  }, [matchState.phase, matchState.currentTurnSeat, matchState.lastPlaySeat, matchState.challengeRule, matchState.trickClaimRank, players]);

  // Victory Handler
  const handleMatchVictory = (champ) => {
    if (!champ) return;
    playWinCelebration();
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });
    const winMsg = `🏆 ${champ.username} EMPTIED THEIR HAND AND WON THE MATCH!`;
    setAnnouncement(winMsg);
    const endedState = {
      ...matchStateRef.current,
      phase: 'ended',
      winner: champ,
      lastPlayedCards: [],
      discardPile: []
    };
    setMatchState(endedState);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'BLUFF_MATCH_VICTORY',
        payload: {
          winner: champ,
          matchState: endedState,
          announcement: winMsg
        }
      });
    }
  };

  // Safety Monitor: Ensure a player who has 0 cards is immediately declared winner
  useEffect(() => {
    if (matchState.phase === 'playing' && !matchState.winner) {
      if (myHand.length === 0 && !matchState.challengeCountdown) {
        const heroP = players.find((p) => p.seat_index === mySeatIndex);
        if (heroP) {
          handleMatchVictory(heroP);
          return;
        }
      }
      if (!matchState.challengeCountdown) {
        const zeroCardsPlayer = players.find((p) => p.cardCount === 0 && p.seat_index !== mySeatIndex);
        if (zeroCardsPlayer) {
          handleMatchVictory(zeroCardsPlayer);
          return;
        }
      }
      const activeP = players.find((p) => p.seat_index === matchState.currentTurnSeat);
      if (activeP) {
        const count = activeP.seat_index === mySeatIndex ? myHand.length : (activeP.cardCount ?? 1);
        if (count === 0) {
          handleMatchVictory(activeP);
        }
      }
    }
  }, [matchState.phase, matchState.challengeCountdown, matchState.winner, matchState.currentTurnSeat, myHand.length, players, mySeatIndex]);

  const isMyTurn = matchState.currentTurnSeat === mySeatIndex && matchState.phase === 'playing' && myHand.length > 0;

  // Strict Turn Rotation vs Anyone Can Call
  const totalPlayersCount = players.length;
  const nextSeatAfterPlay = matchState.lastPlaySeat !== null && totalPlayersCount > 0
    ? (matchState.lastPlaySeat + 1) % totalPlayersCount
    : null;
  const isHeroNext = nextSeatAfterPlay === mySeatIndex;

  const canIChallenge = matchState.phase === 'challenge_window' &&
    matchState.lastPlaySeat !== mySeatIndex &&
    (matchState.challengeRule === 'next_only' ? isHeroNext : true);

  const getCardMargin = (idx, totalInRow) => {
    if (idx === 0) return '0px';
    if (isMobile) {
      // Dynamic margin to utilize mobile width (~360px - 420px) and keep cards readable
      const availableWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth - 28, 430) : 360;
      const cardWidth = 60;
      if (totalInRow <= 1) return '0px';
      const step = (availableWidth - cardWidth) / (totalInRow - 1);
      const computedMargin = step - cardWidth;
      return `${Math.max(-36, Math.min(-14, Math.round(computedMargin)))}px`;
    }
    if (totalInRow > 24) return '-60px';
    if (totalInRow > 18) return '-52px';
    if (totalInRow > 14) return '-44px';
    if (totalInRow > 10) return '-38px';
    if (totalInRow > 6) return '-30px';
    return '-22px';
  };

  // Card & Selection Calculations for Render
  const countOfSelectedRank = selectedRank
    ? myHand.filter((c) => c !== 'Jr' && c !== 'Jb' && (c.length === 3 ? '10' : c[0]) === selectedRank).length
    : 0;

  const row1Cards = isMobile && myHand.length > 7 ? myHand.slice(0, Math.ceil(myHand.length / 2)) : myHand;
  const row2Cards = isMobile && myHand.length > 7 ? myHand.slice(Math.ceil(myHand.length / 2)) : [];

  return (
    <div className="table-viewport-container">
      {/* Top Header */}
      <header className="table-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onLeaveTable} className="table-nav-btn table-back-btn" title="Leave Table">
            <ArrowLeft className="w-4 h-4" />
            <span>Lobby</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎭</span>
            <h2 className="table-room-title">{gameRoom?.roomName || 'Taash Royale • Bluff Arena'}</h2>
            <span className="table-code-badge">{gameRoom?.roomCode || 'BL-SOLO'}</span>
          </div>
        </div>

        {/* Live Announcement Marquee */}
        <div className="table-marquee-box">
          <span style={{ color: '#f59e0b', marginRight: '6px' }}>●</span>
          <span>{announcement}</span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Settings & Waiting Lobby Toggle Button */}
          {matchState.handNumber === 0 && matchState.phase === 'waiting' && (
            <button
              type="button"
              onClick={() => setIsWaitingLobbyMinimized((prev) => !prev)}
              className="table-nav-btn"
              style={{
                background: isWaitingLobbyMinimized ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.45)',
                borderColor: '#a855f7',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title="Toggle Waiting Lobby Settings"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{isWaitingLobbyMinimized ? 'Settings & Lobby' : 'Hide Lobby'}</span>
            </button>
          )}

          {/* Challenge Mode Toggle Button */}
          <button
            type="button"
            onClick={handleToggleChallengeRule}
            className="table-nav-btn"
            style={{
              background: matchState.challengeRule === 'next_only' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
              borderColor: matchState.challengeRule === 'next_only' ? '#3b82f6' : '#a855f7',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
            title="Click to switch challenge mode between 'Anyone' and 'Next Only'"
          >
            <span>{matchState.challengeRule === 'next_only' ? '👉' : '⚡'}</span>
            <span>{matchState.challengeRule === 'next_only' ? 'Next Only' : 'Anyone'}</span>
          </button>

          {matchState.phase === 'waiting' && (
            <button
              onClick={startNewBluffMatch}
              className="table-nav-btn"
              style={{ background: '#059669', borderColor: '#34d399', color: '#ffffff', fontWeight: 900 }}
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Deal Cards</span>
            </button>
          )}

          <button onClick={() => setSoundOn(toggleSound())} className="table-nav-btn" title="Toggle Audio">
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>

          {onToggleTheme && (
            <button onClick={onToggleTheme} className="table-nav-btn">
              {theme === 'light' ? <Moon className="w-4 h-4 text-slate-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>
          )}
        </div>
      </header>

      {/* Main Bluff Felt Stage */}
      <main className="table-stage">
        <div className="poker-table-outer">
          <div className="poker-table-brass-rim">
            <div className={`poker-table-felt-canvas ${feltTheme === 'midnight' ? 'felt-midnight' : 'felt-emerald'}`}>
              <div className="poker-betting-line" />

              {/* CENTER DISCARD PILE & CLAIM STATUS */}
              <div className="poker-community-area">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.2em', color: '#a855f7', textTransform: 'uppercase' }}>
                    {matchState.deckType === 'double' ? '108 CARDS' : '54 CARDS'}
                  </span>
                  <span style={{ color: '#64748b' }}>•</span>
                  <span
                    onClick={handleToggleChallengeRule}
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      color: matchState.challengeRule === 'next_only' ? '#93c5fd' : '#f0abfc',
                      cursor: 'pointer'
                    }}
                    title="Click to toggle challenge mode"
                  >
                    {matchState.challengeRule === 'next_only' ? '👉 STRICT ROTATION' : '⚡ ANYONE CAN CALL'}
                  </span>
                </div>

                {/* Trick Rank Status */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 18px', borderRadius: '9999px', background: 'rgba(15, 23, 42, 0.95)', border: '1.5px solid #a855f7', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc' }}>
                    {matchState.phase === 'ended' ? 'MATCH RESULT:' : (matchState.trickClaimRank ? 'LOCKED TRICK RANK:' : 'TRICK STATUS:')}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 900, color: matchState.phase === 'ended' ? '#fbbf24' : '#ffffff' }}>
                    {matchState.phase === 'ended'
                      ? `🏆 ${matchState.winner?.username || 'WINNER'} WINS!`
                      : (matchState.trickClaimRank
                        ? `${RANK_NAMES[matchState.trickClaimRank] || matchState.trickClaimRank} (${matchState.trickClaimRank}s ONLY)`
                        : `${players.find((p) => p.seat_index === matchState.currentTurnSeat)?.username || 'LEADER'} GETS THE CHANCE`)}
                  </span>
                </div>

                {/* Central Discard Pile Stack */}
                <div style={{ position: 'relative', width: '100px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {matchState.discardPile.length > 0 ? (
                    <>
                      {/* 3D Stack Effect */}
                      <div style={{ position: 'absolute', inset: 0, transform: 'rotate(-4deg) translate(-3px, -3px)', opacity: 0.6 }}>
                        <CardAsset hidden={true} />
                      </div>
                      <div style={{ position: 'absolute', inset: 0, transform: 'rotate(3deg) translate(2px, -2px)', opacity: 0.8 }}>
                        <CardAsset hidden={true} />
                      </div>
                      <CardAsset hidden={true} />
                      <div style={{ position: 'absolute', bottom: '-14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <div style={{ padding: '3px 10px', borderRadius: '9999px', background: '#0f172a', border: '1.5px solid #f59e0b', fontSize: '11px', fontWeight: 900, color: '#fbbf24', boxShadow: '0 4px 12px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
                          {matchState.discardPile.length} in Pile
                        </div>
                        {matchState.burnedCardsCount > 0 && (
                          <div style={{ padding: '2px 8px', borderRadius: '9999px', background: 'rgba(30, 41, 59, 0.9)', border: '1px solid #475569', fontSize: '10px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            🗑️ {matchState.burnedCardsCount} Out of Game
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="poker-card-slot" style={{ borderStyle: 'dashed', borderColor: 'rgba(168, 85, 247, 0.4)', position: 'relative' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Empty Pile</span>
                      {matchState.burnedCardsCount > 0 && (
                        <div style={{ position: 'absolute', bottom: '-22px', padding: '2px 8px', borderRadius: '9999px', background: 'rgba(30, 41, 59, 0.9)', border: '1px solid #475569', fontSize: '10px', fontWeight: 700, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          🗑️ {matchState.burnedCardsCount} Out of Game
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Challenge Reaction Countdown on Center Felt */}
                {matchState.phase === 'challenge_window' && (
                  <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(225, 29, 72, 0.18)', border: '1px solid rgba(225, 29, 72, 0.5)', padding: '4px 12px', borderRadius: '9999px' }}>
                    <Clock className="w-3.5 h-3.5 text-rose-400 animate-spin" />
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#fda4af', letterSpacing: '0.08em' }}>
                      REACTION WINDOW: {challengeTimeLeft}s
                    </span>
                  </div>
                )}
              </div>

              {/* SEATED PLAYERS AROUND OVAL RAIL */}
              {players.map((player) => {
                // Hero is prominently rendered at the bottom viewport via fanned cards and control dock
                if (player.seat_index === mySeatIndex) return null;

                const totalSeats = Math.max(players.length, 6);
                const pos = getSeatCoordinates(player.seat_index, totalSeats, mySeatIndex);
                const isTurn = matchState.currentTurnSeat === player.seat_index && matchState.phase === 'playing';

                return (
                  <div
                    key={player.seat_index}
                    className="poker-seat"
                    style={{ left: pos.left, top: pos.top }}
                  >
                    {/* Hand Count Badge above Pod */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', background: 'rgba(15, 23, 42, 0.9)', padding: '2px 8px', borderRadius: '12px', border: '1px solid #334155' }}>
                      <span style={{ fontSize: '11px' }}>🃏</span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24' }}>
                        {player.cardCount} Cards
                      </span>
                    </div>

                    {/* Player Pod */}
                    <div className={`poker-player-box ${isTurn ? 'active-turn' : ''}`}>
                      <div className="poker-avatar">
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="poker-details">
                        <span className="poker-username">{player.username}</span>
                        <span className="poker-chips">{'SEAT ' + (player.seat_index + 1)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* FLOATING RE-OPEN BUTTON FOR MINIMIZED WAITING LOBBY */}
      {matchState.handNumber === 0 && matchState.phase === 'waiting' && isWaitingLobbyMinimized && (
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

      {/* WAITING LOBBY MODAL (Hand 0 / Pre-match stage) */}
      {matchState.handNumber === 0 && matchState.phase === 'waiting' && !isWaitingLobbyMinimized && (
        <div className="waiting-lobby-overlay">
          <div className="waiting-lobby-card">
            <div className="waiting-lobby-header">
              <div className="waiting-lobby-header-left">
                <div className="waiting-lobby-badge-row">
                  <span className="waiting-lobby-badge" style={{ background: '#7c3aed', color: '#ffffff' }}>BLUFF LOBBY</span>
                  <span className="waiting-lobby-badge-status">
                    {players.length >= 2 ? '🟢 Ready to Deal' : '🟡 Gathering Players'}
                  </span>
                </div>
                <h2 className="waiting-lobby-title">{gameRoom?.roomName || gameRoom?.name || 'Taash Royale • Bluff Master'}</h2>
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
                    <Users className="w-4 h-4 text-purple-400" />
                    <span>Seated Players ({players.length} / {gameRoom?.maxPlayers || 6})</span>
                  </div>

                  <div className="waiting-lobby-actions-group">
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
                        <div className="waiting-roster-avatar" style={{ background: p.isBot ? '#334155' : 'linear-gradient(135deg, #7c3aed, #a855f7)' }}>
                          {p.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="waiting-roster-info">
                          <div className="waiting-roster-name-row">
                            <span className="waiting-roster-name">{p.username}</span>
                            {isHero && <span className="waiting-you-badge">YOU</span>}
                            {p.isBot && <span className="waiting-bot-tag">BOT</span>}
                          </div>
                          <span className="waiting-roster-stack">
                            Seat {p.seat_index + 1}
                          </span>
                        </div>

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

              {/* Table Settings (Live synced) */}
              <div className="waiting-lobby-section">
                <div className="waiting-lobby-section-head">
                  <div className="waiting-lobby-section-title">
                    <Settings className="w-4 h-4 text-emerald-400" />
                    <span>Bluff Rules & Settings</span>
                  </div>
                  <span className="waiting-sync-indicator">⚡ Live synced to all players</span>
                </div>

                <div className="waiting-lobby-settings-grid">
                  {/* Deck Type */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Deck Type</span>
                    </label>
                    <div className="waiting-setting-pills">
                      {[
                        { type: 'single', label: 'Single Deck (54 Cards + 2 Jokers)' },
                        { type: 'double', label: 'Double Deck (108 Cards + 4 Jokers)' }
                      ].map((d) => (
                        <button
                          key={d.type}
                          type="button"
                          onClick={() => handleUpdateSetting({ deckType: d.type })}
                          className={`waiting-pill-btn ${matchState.deckType === d.type ? 'active' : ''}`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Challenge Rule */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <span>Challenge Rule</span>
                    </label>
                    <div className="waiting-setting-pills">
                      {[
                        { rule: 'anyone', label: '⚡ Anyone Can Call' },
                        { rule: 'next_only', label: '👉 Only Next Player' }
                      ].map((r) => (
                        <button
                          key={r.rule}
                          type="button"
                          onClick={() => handleUpdateSetting({ challengeRule: r.rule })}
                          className={`waiting-pill-btn ${matchState.challengeRule === r.rule ? 'active' : ''}`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reaction Window */}
                  <div className="waiting-setting-card">
                    <label className="waiting-setting-label">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Reaction Timer</span>
                    </label>
                    <div className="waiting-setting-pills">
                      {[
                        { sec: 0, label: '∞ No Limit' },
                        { sec: 5, label: '5s Blitz' },
                        { sec: 8, label: '8s Normal' },
                        { sec: 15, label: '15s Relaxed' }
                      ].map((t) => (
                        <button
                          key={t.sec}
                          type="button"
                          onClick={() => handleUpdateSetting({ challengeTime: t.sec })}
                          className={`waiting-pill-btn ${matchState.challengeTime === t.sec ? 'active' : ''}`}
                        >
                          {t.label}
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
                onClick={startNewBluffMatch}
                disabled={players.length < 2}
                className="waiting-lobby-start-btn"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)', borderColor: '#c084fc' }}
              >
                <Play className="w-4 h-4 fill-white" />
                <span>START MATCH & DEAL CARDS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHALLENGE SHOWDOWN REVEAL MODAL */}
      {challengeResult && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#0b0f19', border: '2px solid #a855f7', borderRadius: '24px', padding: '24px', maxWidth: '520px', width: '100%', textAlign: 'center', boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)' }}>
            <span style={{ fontSize: '12px', fontWeight: 900, color: challengeResult.isBluff ? '#f43f5e' : '#10b981', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {challengeResult.isBluff ? '🚨 BLUFF DETECTED!' : '✨ HONEST PLAY!'}
            </span>
            <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: '8px 0 16px 0' }}>
              {challengeResult.isBluff
                ? `${challengeResult.target} was caught bluffing!`
                : `${challengeResult.target} played truthfully!`}
            </h3>

            {/* Revealed Cards */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
              {challengeResult.cards.map((c, i) => (
                <CardAsset key={i} card={c} />
              ))}
            </div>

            <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '16px' }}>
              <strong>{challengeResult.loser}</strong> must pick up the entire pile (<strong>{challengeResult.pileCount} cards</strong>)!
            </p>
          </div>
        </div>
      )}

      {/* GRAND VICTORY MODAL */}
      {matchState.phase === 'ended' && matchState.winner && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'linear-gradient(180deg, #1e1338 0%, #0d091a 100%)',
            border: '2px solid #fbbf24',
            borderRadius: '28px',
            padding: '32px 28px',
            maxWidth: '500px',
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 25px 70px rgba(0, 0, 0, 0.95), 0 0 40px rgba(251, 191, 36, 0.35)',
            animation: 'popIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}>
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              boxShadow: '0 0 30px rgba(251, 191, 36, 0.6)'
            }}>
              <Trophy className="w-10 h-10 text-white fill-white" />
            </div>

            <span style={{ fontSize: '13px', fontWeight: 900, color: '#fbbf24', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              👑 CHAMPION OF TAASH ROYALE 👑
            </span>

            <h2 style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff', margin: '8px 0 6px 0' }}>
              {matchState.winner.username} WINS!
            </h2>

            <p style={{ fontSize: '14px', color: '#cbd5e1', marginBottom: '24px' }}>
              {matchState.winner.seat_index === mySeatIndex ? 'Congratulations! You emptied your hand first and won the match!' : `${matchState.winner.username} has discarded all their cards and won the game!`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {isCreator && (
                <button
                  type="button"
                  onClick={startNewBluffMatch}
                  className="waiting-lobby-start-btn"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
                    borderColor: '#c084fc',
                    width: '100%',
                    justifyContent: 'center'
                  }}
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>PLAY AGAIN (DEAL NEW HAND)</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLeaveTable}
                className="table-nav-btn"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontWeight: 700
                }}
              >
                <span>RETURN TO LOBBY</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-WIDTH BLUFF BOTTOM VIEWPORT (NO GIANT WHITE BACKGROUND) */}
      <div className="bluff-bottom-container">
        {/* Challenge Reaction Slap Banner (Floating Centered Pill) */}
        {matchState.phase === 'challenge_window' && (
          <div className="bluff-challenge-floating-banner">
            <div className="bluff-challenge-banner-info">
              <span className="bluff-challenge-banner-tag">
                {matchState.challengeRule === 'next_only' ? '👉 NEXT PLAYER ONLY' : '⚡ REACTION WINDOW'}
              </span>
              <span className="bluff-challenge-banner-text">
                {matchState.lastPlaySeat === mySeatIndex ? (
                  <span>
                    You played <strong>{matchState.lastPlayedCardsCount} {RANK_NAMES[matchState.trickClaimRank || matchState.currentClaimRank] || (matchState.trickClaimRank || matchState.currentClaimRank)}</strong>. Waiting for challengers...
                  </span>
                ) : (
                  <span>
                    Did <strong>{players.find((p) => p.seat_index === matchState.lastPlaySeat)?.username}</strong> really play <strong>{matchState.lastPlayedCardsCount} {RANK_NAMES[matchState.trickClaimRank || matchState.currentClaimRank] || (matchState.trickClaimRank || matchState.currentClaimRank)}</strong>?
                  </span>
                )}
              </span>
            </div>

            {canIChallenge ? (
              <div className="bluff-challenge-banner-actions">
                <button
                  type="button"
                  onClick={() => handleCallBluff(mySeatIndex)}
                  className="bluff-call-btn-large"
                >
                  <ShieldAlert className="w-5 h-5 text-amber-300 animate-pulse" />
                  <span>CALL BLUFF! ({challengeTimeLeft}s)</span>
                </button>
                <button
                  type="button"
                  onClick={handlePassChallenge}
                  className="bluff-accept-btn-large"
                >
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>{matchState.challengeRule === 'next_only' ? 'ACCEPT & PLAY' : "DON'T CALL"}</span>
                </button>
              </div>
            ) : (
              <div className="bluff-challenge-waiting-pill">
                <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                <span>
                  {matchState.lastPlaySeat === mySeatIndex
                    ? `Waiting for reaction (${challengeTimeLeft}s)`
                    : `Waiting for ${players.find((p) => p.seat_index === nextSeatAfterPlay)?.username || 'next player'} (${challengeTimeLeft}s)`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* FANNED CARDS: SITS DIRECTLY ON FELT ACROSS FULL DESKTOP WIDTH (SINGLE ROW) */}
        <div className="bluff-fanned-container">
          {/* Quick Action: Select All of Rank (Strictly excludes Jokers per Requirement 3) */}
          {selectedRank && countOfSelectedRank > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
              <button
                type="button"
                onClick={() => handleSelectAllOfRank(selectedRank)}
                className="bluff-select-all-floating-btn"
                title={`Select all ${RANK_NAMES[selectedRank] || selectedRank}s (no Jokers)`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Select All {selectedRank}s ({countOfSelectedRank})</span>
              </button>
            </div>
          )}

          <div className="bluff-fanned-row">
            {(isMobile && myHand.length > 7 ? myHand.slice(0, Math.ceil(myHand.length / 2)) : myHand).map((card, i) => {
              const globalIdx = i;
              const isSelected = selectedCardIndices.includes(globalIdx);
              const row1Length = isMobile && myHand.length > 7 ? Math.ceil(myHand.length / 2) : myHand.length;
              const cardMargin = getCardMargin(i, row1Length);
              const isJoker = card === 'Jr' || card === 'Jb';
              const cardRank = isJoker ? null : (card.length === 3 ? '10' : card[0]);

              return (
                <div
                  key={`${card}-${globalIdx}`}
                  onClick={() => {
                    if (isSelected) {
                      const newIndices = selectedCardIndices.filter((idx) => idx !== globalIdx);
                      setSelectedCardIndices(newIndices);
                      if (newIndices.length === 0) setSelectedRank(null);
                    } else {
                      if (selectedCardIndices.length >= 4) {
                        alert('In Bluff, you can select and play at most 4 cards per turn.');
                        return;
                      }
                      setSelectedCardIndices([...selectedCardIndices, globalIdx]);
                      if (cardRank) {
                        setSelectedRank(cardRank);
                        if (!matchState.trickClaimRank) {
                          setHeroClaimRank(cardRank);
                        }
                      }
                    }
                  }}
                  className={`bluff-fanned-card ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    marginLeft: cardMargin,
                    zIndex: 10 + i
                  }}
                >
                  <CardAsset card={card} isHero={true} />
                  {isSelected && (
                    <div className="bluff-card-selected-badge">
                      <Check className="w-3 h-3 text-white stroke-[3]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Row 2 ONLY on mobile if mobile has > 7 cards */}
          {isMobile && myHand.length > 7 && (
            <div className="bluff-fanned-row row-two">
              {myHand.slice(Math.ceil(myHand.length / 2)).map((card, i) => {
                const globalIdx = Math.ceil(myHand.length / 2) + i;
                const isSelected = selectedCardIndices.includes(globalIdx);
                const row2Length = myHand.length - Math.ceil(myHand.length / 2);
                const cardMargin = getCardMargin(i, row2Length);
                const isJoker = card === 'Jr' || card === 'Jb';
                const cardRank = isJoker ? null : (card.length === 3 ? '10' : card[0]);

                return (
                  <div
                    key={`${card}-${globalIdx}`}
                    onClick={() => {
                      if (isSelected) {
                        const newIndices = selectedCardIndices.filter((idx) => idx !== globalIdx);
                        setSelectedCardIndices(newIndices);
                        if (newIndices.length === 0) setSelectedRank(null);
                      } else {
                        if (selectedCardIndices.length >= 4) {
                          alert('In Bluff, you can select and play at most 4 cards per turn.');
                          return;
                        }
                        setSelectedCardIndices([...selectedCardIndices, globalIdx]);
                        if (cardRank) {
                          setSelectedRank(cardRank);
                          if (!matchState.trickClaimRank) {
                            setHeroClaimRank(cardRank);
                          }
                        }
                      }
                    }}
                    className={`bluff-fanned-card ${isSelected ? 'is-selected' : ''}`}
                    style={{
                      marginLeft: cardMargin,
                      zIndex: 10 + i
                    }}
                  >
                    <CardAsset card={card} isHero={true} />
                    {isSelected && (
                      <div className="bluff-card-selected-badge">
                        <Check className="w-3 h-3 text-white stroke-[3]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SLEEK FLOATING CONTROL DOCK (DARK GLASS, NO WHITE BACKGROUND) */}
        <div className={`bluff-controls-dock ${isMyTurn ? 'is-hero-turn' : ''}`}>
          {/* Left: Hero identity, Hand count, Sort, Auto-select */}
          <div className="bluff-dock-left">
            <div className="bluff-dock-hero-profile">
              <div className="poker-avatar bluff-dock-avatar" style={{ background: '#7c3aed', color: '#ffffff' }}>
                {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="bluff-dock-hero-meta">
                <span className="bluff-dock-hero-name">{user?.username || 'You'}</span>
                <span className="bluff-dock-hero-hand-count">🃏 <strong>{myHand.length}</strong> Cards</span>
              </div>
            </div>
            {selectedCardIndices.length > 0 && (
              <span className="bluff-dock-selected-chip">{selectedCardIndices.length} Selected</span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleSortHand}
                className="table-nav-btn bluff-dock-btn"
                title="Sort hand by rank"
              >
                Sort
              </button>
              <button
                type="button"
                onClick={() => handleSelectAllOfRank(selectedRank || matchState.trickClaimRank || heroClaimRank)}
                className="table-nav-btn bluff-dock-btn"
                style={{
                  borderColor: selectedRank ? '#c084fc' : '#a855f7',
                  color: selectedRank ? '#f3e8ff' : '#c084fc',
                  background: selectedRank ? 'rgba(168, 85, 247, 0.28)' : undefined
                }}
                title={`Select all ${selectedRank || matchState.trickClaimRank || heroClaimRank}s from your hand (excludes Jokers)`}
              >
                <Zap className="w-3 h-3 text-amber-300" />
                <span>
                  All {selectedRank || matchState.trickClaimRank || heroClaimRank}s
                  {selectedRank && countOfSelectedRank > 0 ? ` (${countOfSelectedRank})` : ''}
                </span>
              </button>
            </div>
          </div>

          {/* Center: Locked Trick Rank vs Lead Any Rank Selector */}
          {matchState.phase === 'ended' ? (
            <div className="bluff-dock-center">
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24' }}>
                🏆 MATCH CONCLUDED • {matchState.winner?.username || 'Winner'} WON!
              </span>
            </div>
          ) : isMyTurn ? (
            matchState.trickClaimRank ? (
              <div className="bluff-dock-center">
                <div className="bluff-dock-locked-chip">
                  <span className="bluff-dock-locked-tag">🔒 LOCKED RANK:</span>
                  <span className="bluff-dock-locked-rank">
                    {matchState.trickClaimRank}s ({RANK_NAMES[matchState.trickClaimRank] || matchState.trickClaimRank})
                  </span>
                  <span className="bluff-dock-locked-sub">
                    • Play as {matchState.trickClaimRank}s (Truth / Bluff) or PASS
                  </span>
                </div>
              </div>
            ) : (
              <div className="bluff-dock-center">
                <span className="bluff-dock-label">LEAD ANY RANK:</span>
                <div className="bluff-declare-pills">
                  {BLUFF_RANKS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setHeroClaimRank(r)}
                      className={`bluff-declare-pill ${heroClaimRank === r ? 'active' : ''}`}
                      title={`Lead with ${RANK_NAMES[r] || r}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="bluff-dock-center-waiting">
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Waiting for <strong>{players.find((p) => p.seat_index === matchState.currentTurnSeat)?.username || 'opponent'}</strong> to play...
                {matchState.trickClaimRank && (
                  <span style={{ color: '#c084fc', marginLeft: '6px' }}>
                    (Locked: {matchState.trickClaimRank}s)
                  </span>
                )}
              </span>
            </div>
          )}

          {/* Right: Turn Actions (Pass / Play / Rematch) */}
          <div className="bluff-dock-right">
            {matchState.phase === 'ended' ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                {isCreator && (
                  <button
                    type="button"
                    onClick={startNewBluffMatch}
                    className="bluff-play-btn-large"
                    style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)' }}
                  >
                    PLAY AGAIN
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLeaveTable}
                  className="table-nav-btn bluff-dock-btn"
                  style={{ padding: '8px 16px' }}
                >
                  LEAVE
                </button>
              </div>
            ) : (
              <>
                {isMyTurn && matchState.passAllowed && (
                  <button
                    type="button"
                    onClick={() => handlePassTurn(mySeatIndex)}
                    className="table-nav-btn bluff-dock-btn"
                    style={{ padding: '8px 18px', fontWeight: 800, background: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444', color: '#fca5a5' }}
                  >
                    PASS
                  </button>
                )}

                <button
                  type="button"
                  disabled={!isMyTurn || selectedCardIndices.length === 0}
                  onClick={() => {
                    const cardsToPlay = selectedCardIndices.map((i) => myHand[i]);
                    const rankToPlay = matchState.trickClaimRank || heroClaimRank;
                    handlePlayCards(cardsToPlay, true, rankToPlay);
                  }}
                  className="bluff-play-btn-large"
                >
                  <Flame className="w-4 h-4 text-amber-300" />
                  <span>
                    {selectedCardIndices.length > 0
                      ? (matchState.trickClaimRank
                          ? `PLAY ${selectedCardIndices.length} AS ${RANK_NAMES[matchState.trickClaimRank] || matchState.trickClaimRank}`
                          : `LEAD ${selectedCardIndices.length} ${RANK_NAMES[heroClaimRank] || heroClaimRank}`)
                      : `SELECT CARDS`}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
