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
  ChevronDown
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
    discardPile: [],
    deckType: gameRoom?.deckType || 'single', // 'single' (54) | 'double' (108)
    passAllowed: gameRoom?.passAllowed ?? true,
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
  const playersRef = useRef(players);
  const matchStateRef = useRef(matchState);
  const myHandRef = useRef(myHand);

  const isCreator = (gameRoom?.host_username || gameRoom?.hostUsername) === user?.username || Boolean(gameRoom?.isHost);

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
        setAnnouncement(`Practice Mode (${totalMax} Players) • Click START MATCH to deal`);
      }
      return;
    }

    // Multiplayer room setup
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
        .on('broadcast', { event: 'BLUFF_STATE_SYNC' }, ({ payload }) => {
          if (!payload) return;
          if (payload.matchState) setMatchState(payload.matchState);
          if (payload.announcement) setAnnouncement(payload.announcement);
          if (payload.players) {
            setPlayers((prev) =>
              payload.players.map((p) => ({
                ...p,
                cards: p.seat_index === mySeatIndex ? myHandRef.current : []
              }))
            );
          }
          if (payload.challengeResult) setChallengeResult(payload.challengeResult);
        })
        .on('broadcast', { event: 'BLUFF_CHALLENGE_CALLED' }, ({ payload }) => {
          playCheckKnock();
          setAnnouncement(`🚨 ${payload.challenger} CALLED BLUFF on ${payload.target}!`);
        });

      channel.subscribe();
      channelRef.current = channel;
    };

    initMultiplayer();

    return () => {
      isMounted = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [gameRoom, user]);

  // Deal New Bluff Hand
  const startNewBluffMatch = () => {
    playCardDeal();
    const currentList = [...playersRef.current];
    const deck = createBluffDeck(matchState.deckType);
    const hands = dealBluffCards(deck, currentList.length);

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
      discardPile: [],
      winner: null
    };

    setMatchState(newMatch);
    setPlayers(updatedPlayers);
    const msg = `🃏 Dealt ${deck.length} cards! ${starter?.username} leads the round. Play any card & quantity!`;
    setAnnouncement(msg);

    broadcastState(updatedPlayers, newMatch, msg);
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
    const claimedRank = claimedRankOverride || (isHero ? heroClaimRank : matchState.currentClaimRank);

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
    const claimMsg = `${activePlayer?.username} plays ${cardsToPlay.length} ${RANK_NAMES[claimedRank] || claimedRank}!`;
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
      currentClaimRank: claimedRank,
      discardPile: newPile,
      winner: emptiedHand ? activePlayer : null
    };

    setMatchState(nextState);
    setPlayers(updatedPlayers);

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
    if (activeState.winner) {
      handleMatchVictory(activeState.winner);
      return;
    }

    // Advance to next player in clockwise order (free to play any card & quantity)
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
    setAnnouncement(`✅ Nobody called bluff! Turn passes to ${nextP?.username}. Play any card & quantity!`);
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
  };

  // Auto-Select Cards Matching Current Claim Rank
  const handleAutoSelectCurrentRank = () => {
    const targetRank = heroClaimRank;
    const matching = [];
    myHand.forEach((c, idx) => {
      const isJoker = c === 'Jr' || c === 'Jb';
      const cRank = c.length === 3 ? '10' : c[0];
      if (isJoker || cRank === targetRank) {
        matching.push(idx);
      }
    });
    setSelectedCardIndices(matching);
  };

  // Action: Call Bluff!
  const handleCallBluff = (challengerSeat) => {
    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    setChallengeTimeLeft(0);
    playCheckKnock();

    const blufferSeat = matchState.lastPlaySeat;
    const bluffer = players.find((p) => p.seat_index === blufferSeat);
    const challenger = players.find((p) => p.seat_index === challengerSeat);

    const playedCards = matchState.lastPlayedCards;
    const claimedRank = matchState.currentClaimRank;

    // Verify truth or bluff with wildcard Jokers
    const { isBluff, legalCards, bluffCards } = verifyPlay(playedCards, claimedRank);

    let loserSeat = isBluff ? blufferSeat : challengerSeat;
    let loser = isBluff ? bluffer : challenger;

    // Loser picks up entire central pile!
    const wholePile = matchState.discardPile;

    const updatedPlayers = players.map((p) => {
      if (p.seat_index === loserSeat) {
        const combinedHand = p.seat_index === mySeatIndex ? sortHand([...myHand, ...wholePile]) : (p.isBot ? sortHand([...p.cards, ...wholePile]) : []);
        if (p.seat_index === mySeatIndex) setMyHand(combinedHand);
        return {
          ...p,
          cards: combinedHand,
          cardCount: p.cardCount + wholePile.length
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

    setChallengeResult(result);
    setPlayers(updatedPlayers);

    if (isBluff) {
      setAnnouncement(`🚨 CAUGHT! ${bluffer?.username} was BLUFFING! Picks up ${wholePile.length} cards.`);
    } else {
      setAnnouncement(`✨ INNOCENT! ${bluffer?.username} told the truth! ${challenger?.username} picks up ${wholePile.length} cards.`);
    }

    // Winner of challenge starts next round with any card and any quantity!
    const nextStarterSeat = isBluff ? challengerSeat : blufferSeat;

    setTimeout(() => {
      setChallengeResult(null);
      setMatchState((prev) => ({
        ...prev,
        phase: 'playing',
        currentTurnSeat: nextStarterSeat,
        discardPile: [],
        lastPlayedCards: []
      }));
      const starter = players.find((p) => p.seat_index === nextStarterSeat);
      setAnnouncement(`✨ ${starter?.username} won the challenge and leads the round with any card!`);
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
            matchState.currentClaimRank,
            matchState.passAllowed,
            matchState.discardPile.length
          );
          if (decision.action === 'pass') {
            const nextSeat = (matchState.currentTurnSeat + 1) % players.length;
            setMatchState((prev) => ({
              ...prev,
              currentTurnSeat: nextSeat
            }));
            setAnnouncement(`⏭️ ${activeP.username} passed their turn.`);
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
            matchState.currentClaimRank,
            matchState.lastPlayedCardsCount,
            matchState.discardPile.length,
            matchState.deckType,
            lastPlayerCardCount
          );

          const timer = setTimeout(() => {
            if (wantsToCall) {
              handleCallBluff(nextBot.seat_index);
            } else {
              // Bot accepts! Immediately advance to bot's turn to play
              handlePassChallenge();
            }
          }, 1600);
          return () => clearTimeout(timer);
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
          matchState.currentClaimRank,
          matchState.lastPlayedCardsCount,
          matchState.discardPile.length,
          matchState.deckType,
          lastPlayerCardCount
        );

        if (wantsToCall) {
          const delay = heroCanCall
            ? Math.floor(Math.random() * 1400) + 3800 // Hero has 3.8s+ to react!
            : Math.floor(Math.random() * 1400) + 1800;

          const timer = setTimeout(() => {
            handleCallBluff(bot.seat_index);
          }, delay);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [matchState.phase, matchState.currentTurnSeat, matchState.lastPlaySeat, matchState.challengeRule, players]);

  // Victory Handler
  const handleMatchVictory = (champ) => {
    playWinCelebration();
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });
    setAnnouncement(`🏆 ${champ.username} EMPTIED THEIR HAND AND WINS THE MATCH!`);
    setMatchState((prev) => ({ ...prev, phase: 'ended', winner: champ }));
  };

  const isMyTurn = matchState.currentTurnSeat === mySeatIndex && matchState.phase === 'playing';

  // Strict Turn Rotation vs Anyone Can Call
  const totalPlayersCount = players.length;
  const nextSeatAfterPlay = matchState.lastPlaySeat !== null && totalPlayersCount > 0
    ? (matchState.lastPlaySeat + 1) % totalPlayersCount
    : null;
  const isHeroNext = nextSeatAfterPlay === mySeatIndex;

  const canIChallenge = matchState.phase === 'challenge_window' &&
    matchState.lastPlaySeat !== mySeatIndex &&
    (matchState.challengeRule === 'next_only' ? isHeroNext : true);

  const getCardMargin = (idx, total) => {
    if (idx === 0) return '0px';
    if (isMobile) return '-32px';
    if (total > 24) return '-60px';
    if (total > 18) return '-52px';
    if (total > 14) return '-44px';
    if (total > 10) return '-38px';
    if (total > 6) return '-30px';
    return '-22px';
  };

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
            <h2 className="table-room-title">{gameRoom?.roomName || 'Bluff Master Table'}</h2>
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

                {/* Last Play Claim or Free Play Status */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 18px', borderRadius: '9999px', background: 'rgba(15, 23, 42, 0.95)', border: '1.5px solid #a855f7', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc' }}>
                    {matchState.discardPile.length > 0 ? 'LAST CLAIM:' : 'ROUND STATUS:'}
                  </span>
                  <span style={{ fontSize: '16px', fontWeight: 900, color: '#ffffff' }}>
                    {matchState.discardPile.length > 0
                      ? `${matchState.lastPlayedCardsCount} ${RANK_NAMES[matchState.currentClaimRank] || matchState.currentClaimRank}`
                      : 'FREE PLAY • ANY CARD'}
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
                      <div style={{ position: 'absolute', bottom: '-10px', padding: '3px 10px', borderRadius: '9999px', background: '#0f172a', border: '1.5px solid #f59e0b', fontSize: '11px', fontWeight: 900, color: '#fbbf24', boxShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                        {matchState.discardPile.length} Cards in Pile
                      </div>
                    </>
                  ) : (
                    <div className="poker-card-slot" style={{ borderStyle: 'dashed', borderColor: 'rgba(168, 85, 247, 0.4)' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>Empty Pile</span>
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
                    You played <strong>{matchState.lastPlayedCardsCount} {RANK_NAMES[matchState.currentClaimRank] || matchState.currentClaimRank}</strong>. Waiting for challengers...
                  </span>
                ) : (
                  <span>
                    Did <strong>{players.find((p) => p.seat_index === matchState.lastPlaySeat)?.username}</strong> really play <strong>{matchState.lastPlayedCardsCount} {RANK_NAMES[matchState.currentClaimRank] || matchState.currentClaimRank}</strong>?
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
          <div className="bluff-fanned-row">
            {(isMobile && myHand.length > 7 ? myHand.slice(0, Math.ceil(myHand.length / 2)) : myHand).map((card, i) => {
              const globalIdx = i;
              const isSelected = selectedCardIndices.includes(globalIdx);
              const cardMargin = getCardMargin(i, myHand.length);

              return (
                <div
                  key={`${card}-${globalIdx}`}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCardIndices(selectedCardIndices.filter((idx) => idx !== globalIdx));
                    } else {
                      setSelectedCardIndices([...selectedCardIndices, globalIdx]);
                      // Auto-set declared rank to clicked card
                      if (card && card !== 'Jr' && card !== 'Jb') {
                        const r = card.length === 3 ? '10' : card[0];
                        setHeroClaimRank(r);
                      }
                    }
                  }}
                  className={`bluff-fanned-card ${isSelected ? 'is-selected' : ''}`}
                  style={{
                    marginLeft: cardMargin,
                    zIndex: isSelected ? 120 + i : 10 + i
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
                return (
                  <div
                    key={`${card}-${globalIdx}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedCardIndices(selectedCardIndices.filter((idx) => idx !== globalIdx));
                      } else {
                        setSelectedCardIndices([...selectedCardIndices, globalIdx]);
                        if (card && card !== 'Jr' && card !== 'Jb') {
                          const r = card.length === 3 ? '10' : card[0];
                          setHeroClaimRank(r);
                        }
                      }
                    }}
                    className={`bluff-fanned-card ${isSelected ? 'is-selected' : ''}`}
                    style={{
                      marginLeft: i === 0 ? '0px' : '-32px',
                      zIndex: isSelected ? 120 + i : 10 + i
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
                onClick={handleAutoSelectCurrentRank}
                className="table-nav-btn bluff-dock-btn"
                style={{ borderColor: '#a855f7', color: '#c084fc' }}
                title={`Select ${heroClaimRank}s from your hand`}
              >
                Pick {heroClaimRank}
              </button>
            </div>
          </div>

          {/* Center: Declare Rank Selector (Only active on your turn) */}
          {isMyTurn ? (
            <div className="bluff-dock-center">
              <span className="bluff-dock-label">DECLARE:</span>
              <div className="bluff-declare-pills">
                {BLUFF_RANKS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setHeroClaimRank(r)}
                    className={`bluff-declare-pill ${heroClaimRank === r ? 'active' : ''}`}
                    title={`Declare rank as ${RANK_NAMES[r] || r}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bluff-dock-center-waiting">
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                Waiting for <strong>{players.find((p) => p.seat_index === matchState.currentTurnSeat)?.username || 'opponent'}</strong> to play...
              </span>
            </div>
          )}

          {/* Right: Turn Actions (Pass / Play) */}
          <div className="bluff-dock-right">
            {isMyTurn && matchState.passAllowed && (
              <button
                type="button"
                onClick={() => {
                  setMatchState((prev) => ({
                    ...prev,
                    currentTurnSeat: (prev.currentTurnSeat + 1) % players.length
                  }));
                  setAnnouncement('You passed your turn.');
                }}
                className="table-nav-btn bluff-dock-btn"
                style={{ padding: '8px 16px', fontWeight: 800 }}
              >
                PASS
              </button>
            )}

            <button
              type="button"
              disabled={!isMyTurn || selectedCardIndices.length === 0}
              onClick={() => {
                const cardsToPlay = selectedCardIndices.map((i) => myHand[i]);
                handlePlayCards(cardsToPlay, true, heroClaimRank);
              }}
              className="bluff-play-btn-large"
            >
              <Flame className="w-4 h-4 text-amber-300" />
              <span>
                {selectedCardIndices.length > 0
                  ? `PLAY ${selectedCardIndices.length} ${RANK_NAMES[heroClaimRank] || heroClaimRank}`
                  : `SELECT CARDS`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
