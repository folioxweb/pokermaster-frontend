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
    challengeTime: gameRoom?.challengeTime ?? 5, // seconds for challenge window (0 = no limit)
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

    const newMatch = {
      ...matchState,
      handNumber: matchState.handNumber + 1,
      phase: 'playing',
      currentTurnSeat: 0,
      lastPlaySeat: null,
      lastPlayedCardsCount: 0,
      lastPlayedCards: [],
      currentClaimRank: 'A',
      discardPile: [],
      winner: null
    };

    setMatchState(newMatch);
    setPlayers(updatedPlayers);
    setAnnouncement(`🃏 Dealt ${deck.length} cards! First turn starts on ACES.`);

    broadcastState(updatedPlayers, newMatch, 'First turn starts on ACES');
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
  const handlePlayCards = (cardsToPlay, isHero = true) => {
    if (cardsToPlay.length === 0 || cardsToPlay.length > 4) {
      alert('You must select between 1 and 4 cards to play.');
      return;
    }

    playCardDeal();
    const activeSeat = matchState.currentTurnSeat;
    const claimedRank = matchState.currentClaimRank;

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
      discardPile: newPile,
      winner: emptiedHand ? activePlayer : null
    };

    setMatchState(nextState);
    setPlayers(updatedPlayers);

    // Start challenge window countdown
    const winTime = matchState.challengeTime > 0 ? matchState.challengeTime : 5;
    setChallengeTimeLeft(winTime);

    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
    challengeTimerRef.current = setInterval(() => {
      setChallengeTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(challengeTimerRef.current);
          handleChallengeTimeout(nextState, updatedPlayers);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Challenge Window Expired Without Anyone Calling Bluff
  const handleChallengeTimeout = (stateToAdvance, currentPlayersList) => {
    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);

    // If last player emptied their hand and wasn't challenged, they WIN!
    if (stateToAdvance.winner) {
      handleMatchVictory(stateToAdvance.winner);
      return;
    }

    // Advance to next player and next rank
    const nextRank = getNextClaimRank(stateToAdvance.currentClaimRank);
    const totalPlayers = currentPlayersList.length;
    let nextSeat = (stateToAdvance.lastPlaySeat + 1) % totalPlayers;

    const advancedState = {
      ...stateToAdvance,
      phase: 'playing',
      currentTurnSeat: nextSeat,
      currentClaimRank: nextRank,
      lastPlayedCards: []
    };

    setMatchState(advancedState);
    const nextP = currentPlayersList.find((p) => p.seat_index === nextSeat);
    setAnnouncement(`✅ Nobody called bluff! Turn passes to ${nextP?.username} for ${RANK_NAMES[nextRank]}.`);
  };

  // Action: Call Bluff!
  const handleCallBluff = (challengerSeat) => {
    if (challengeTimerRef.current) clearInterval(challengeTimerRef.current);
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

    // Winner of challenge starts next round
    const nextStarterSeat = isBluff ? challengerSeat : blufferSeat;
    const nextRank = getNextClaimRank(matchState.currentClaimRank);

    setTimeout(() => {
      setChallengeResult(null);
      setMatchState((prev) => ({
        ...prev,
        phase: 'playing',
        currentTurnSeat: nextStarterSeat,
        currentClaimRank: nextRank,
        discardPile: [],
        lastPlayedCards: []
      }));
    }, 4500);
  };

  // Bot Turn Automation
  useEffect(() => {
    if (matchState.phase === 'playing') {
      const activeP = players.find((p) => p.seat_index === matchState.currentTurnSeat);
      if (activeP && activeP.isBot) {
        const timer = setTimeout(() => {
          const decision = decideBotPlay(activeP.cards, matchState.currentClaimRank, matchState.passAllowed);
          if (decision.action === 'pass') {
            const nextSeat = (matchState.currentTurnSeat + 1) % players.length;
            setMatchState((prev) => ({
              ...prev,
              currentTurnSeat: nextSeat,
              currentClaimRank: getNextClaimRank(prev.currentClaimRank)
            }));
            setAnnouncement(`⏭️ ${activeP.username} passed their turn.`);
          } else {
            handlePlayCards(decision.cards, false);
          }
        }, 1600);
        return () => clearTimeout(timer);
      }
    }

    // Bot Challenge Slap in Challenge Window
    if (matchState.phase === 'challenge_window') {
      const bots = players.filter((p) => p.isBot && p.seat_index !== matchState.lastPlaySeat);
      for (const bot of bots) {
        const wantsToCall = decideBotCallBluff(
          bot.cards,
          matchState.currentClaimRank,
          matchState.lastPlayedCardsCount,
          matchState.discardPile.length,
          matchState.deckType
        );
        if (wantsToCall) {
          const timer = setTimeout(() => {
            handleCallBluff(bot.seat_index);
          }, Math.floor(Math.random() * 1800) + 800);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [matchState.phase, matchState.currentTurnSeat, players]);

  // Victory Handler
  const handleMatchVictory = (champ) => {
    playWinCelebration();
    confetti({ particleCount: 220, spread: 110, origin: { y: 0.5 } });
    setAnnouncement(`🏆 ${champ.username} EMPTIED THEIR HAND AND WINS THE MATCH!`);
    setMatchState((prev) => ({ ...prev, phase: 'ended', winner: champ }));
  };

  const isMyTurn = matchState.currentTurnSeat === mySeatIndex && matchState.phase === 'playing';
  const canIChallenge = matchState.phase === 'challenge_window' && matchState.lastPlaySeat !== mySeatIndex;

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
                <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.25em', color: '#a855f7', textTransform: 'uppercase', marginBottom: '4px' }}>
                  BLUFF MASTER • {matchState.deckType === 'double' ? '108 CARDS (2 DECKS)' : '54 CARDS (1 DECK)'}
                </span>

                {/* Current Sequential Claim Rank */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 18px', borderRadius: '9999px', background: 'rgba(15, 23, 42, 0.95)', border: '1.5px solid #a855f7', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#c084fc' }}>CURRENT CLAIM:</span>
                  <span style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>
                    {RANK_NAMES[matchState.currentClaimRank] || matchState.currentClaimRank}
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

                {/* Challenge Reaction Slap Window */}
                {matchState.phase === 'challenge_window' && (
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 900, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      ⚡ CHALLENGE WINDOW: {challengeTimeLeft}s
                    </span>
                    {canIChallenge && (
                      <button
                        type="button"
                        onClick={() => handleCallBluff(mySeatIndex)}
                        style={{
                          background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)',
                          border: '2px solid #fda4af',
                          color: '#ffffff',
                          fontWeight: 900,
                          fontSize: '14px',
                          padding: '10px 24px',
                          borderRadius: '9999px',
                          cursor: 'pointer',
                          boxShadow: '0 0 25px rgba(225, 29, 72, 0.7)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <ShieldAlert className="w-5 h-5 text-amber-300" />
                        <span>CALL BLUFF!</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* SEATED PLAYERS AROUND OVAL RAIL */}
              {players.map((player) => {
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
                        {player.seat_index === mySeatIndex ? myHand.length : player.cardCount} Cards
                      </span>
                    </div>

                    {/* Player Pod */}
                    <div className={`poker-player-box ${isTurn ? 'active-turn' : ''} ${player.seat_index === mySeatIndex ? 'hero' : ''}`}>
                      <div className="poker-avatar">
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="poker-details">
                        <span className="poker-username">{player.username}</span>
                        <span className="poker-chips">{player.seat_index === mySeatIndex ? 'YOU' : 'SEAT ' + (player.seat_index + 1)}</span>
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

      {/* BOTTOM ACTION TRAY: PLAYER'S HAND (MULTICARD SELECT) */}
      <div className="poker-hud-wrapper" style={{ maxWidth: '820px' }}>
        <div className="poker-hud-panel" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#e0e7ff' }}>YOUR HAND:</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Select 1 to 4 cards to discard as <strong>{RANK_NAMES[matchState.currentClaimRank] || matchState.currentClaimRank}</strong>
              </span>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#fbbf24' }}>
              {selectedCardIndices.length} Selected
            </span>
          </div>

          {/* Cards Tray with Horizontal Scroll */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', scrollBehavior: 'smooth' }}>
            {myHand.map((card, idx) => {
              const isSelected = selectedCardIndices.includes(idx);
              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedCardIndices(selectedCardIndices.filter((i) => i !== idx));
                    } else if (selectedCardIndices.length < 4) {
                      setSelectedCardIndices([...selectedCardIndices, idx]);
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    transform: isSelected ? 'translateY(-10px)' : 'none',
                    transition: 'transform 0.15s ease',
                    boxShadow: isSelected ? '0 0 12px #a855f7' : 'none'
                  }}
                >
                  <CardAsset card={card} isHero={true} />
                </div>
              );
            })}
          </div>

          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            {isMyTurn && matchState.passAllowed && (
              <button
                type="button"
                onClick={() => {
                  setMatchState((prev) => ({
                    ...prev,
                    currentTurnSeat: (prev.currentTurnSeat + 1) % players.length,
                    currentClaimRank: getNextClaimRank(prev.currentClaimRank)
                  }));
                  setAnnouncement('You passed your turn.');
                }}
                className="table-nav-btn"
                style={{ padding: '8px 16px' }}
              >
                PASS TURN
              </button>
            )}

            <button
              type="button"
              disabled={!isMyTurn || selectedCardIndices.length === 0}
              onClick={() => {
                const cardsToPlay = selectedCardIndices.map((i) => myHand[i]);
                handlePlayCards(cardsToPlay, true);
              }}
              style={{
                background: !isMyTurn || selectedCardIndices.length === 0 ? '#334155' : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
                color: '#ffffff',
                fontWeight: 900,
                fontSize: '13px',
                padding: '8px 20px',
                borderRadius: '10px',
                border: 'none',
                cursor: !isMyTurn || selectedCardIndices.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Flame className="w-4 h-4 text-amber-300" />
              <span>
                {selectedCardIndices.length > 0
                  ? `PLAY ${selectedCardIndices.length} ${RANK_NAMES[matchState.currentClaimRank] || matchState.currentClaimRank}`
                  : `SELECT CARDS AS ${matchState.currentClaimRank}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
