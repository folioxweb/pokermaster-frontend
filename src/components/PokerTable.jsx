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
import { getSeatCoordinates } from '../lib/seatingMath';
import { evaluateHand } from '../lib/pokerEvaluator';
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

const BOT_NAMES = ['Viper', 'AceHigh', 'BluffKing', 'Maverick', 'ChipLeader', 'LadyLuck', 'RiverRat'];

export const PokerTable = ({
  gameRoom,
  user,
  onLeaveTable
}) => {
  const [feltTheme, setFeltTheme] = useState('emerald');
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [copiedCode, setCopiedCode] = useState(false);
  const heroSeatIndex = 0;

  // Players at Table (Initially only the user, or practice bots if Practice Mode)
  const [players, setPlayers] = useState([]);
  
  // Game State
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

  const [turnTimeLeft, setTurnTimeLeft] = useState(gameRoom?.turnTime || 25);
  const turnMaxTime = gameRoom?.turnTime || 25;
  const [winningCards, setWinningCards] = useState([]);
  const [announcement, setAnnouncement] = useState('Waiting for host to start hand');

  const turnTimerRef = useRef(null);

  // Initialize Seated Players
  useEffect(() => {
    const totalMax = Math.max(3, Math.min(8, gameRoom?.maxPlayers || 6));
    const initialList = [];

    // Seat 0: The User (Hero)
    initialList.push({
      seat_index: 0,
      username: user?.username || 'Hero',
      chips: gameRoom?.startingStack || 1500,
      current_round_bet: 0,
      total_hand_bet: 0,
      status: 'active',
      last_action: null,
      cards: [],
      shownCards: true,
      isBot: false
    });

    if (gameRoom?.isPractice) {
      // In Practice mode: pre-fill bots for quick solo play
      for (let i = 1; i < totalMax; i++) {
        initialList.push({
          seat_index: i,
          username: BOT_NAMES[i - 1] || `Player ${i + 1}`,
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
      setAnnouncement('Practice Mode: Click "Deal Hand" to play');
    } else {
      setAnnouncement(`Table Created! Share Code: ${gameRoom?.roomCode || 'PK-CODE'}`);
    }

    setPlayers(initialList);
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

  // AI Bot Turn Execution (With deliberate, human-readable 2.5s pacing)
  useEffect(() => {
    if (handState.phase === 'waiting' || handState.phase === 'ended' || handState.phase === 'showdown') {
      return;
    }

    const activePlayer = players.find((p) => p.seat_index === handState.currentTurnSeat);
    if (!activePlayer || !activePlayer.isBot) {
      return;
    }

    // Give human time to observe the table
    const timer = setTimeout(() => {
      executeBotTurn(activePlayer);
    }, 2200);

    return () => clearTimeout(timer);
  }, [handState.currentTurnSeat, handState.phase, players]);

  // Host Adds an AI Bot to an open seat
  const handleAddBot = () => {
    const totalMax = Math.max(3, Math.min(8, gameRoom?.maxPlayers || 6));
    if (players.length >= totalMax) {
      alert('Table is full!');
      return;
    }

    // Find next unoccupied seat index
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

    setPlayers([...players, newBot]);
    setAnnouncement(`Added ${botName} to Seat ${openSeat + 1}`);
  };

  // Helper to shuffle standard deck
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

  // START HAND (Triggered only when host clicks "Deal Hand")
  const startNewHand = () => {
    if (players.length < 2) {
      alert('At least 2 players are needed to deal a hand. Click "+ Add Bot" or invite a friend!');
      return;
    }

    const activeList = players.filter((p) => p.chips > 0);
    if (activeList.length < 2) {
      setAnnouncement('Not enough players with chips remaining!');
      return;
    }

    const deck = generateDeck();
    let deckIdx = 0;

    const nextDealerSeat = (handState.dealerSeat + 1) % players.length;
    const sbSeat = (nextDealerSeat + 1) % players.length;
    const bbSeat = (nextDealerSeat + 2) % players.length;
    const utgSeat = (nextDealerSeat + 3) % players.length;

    const sbAmount = gameRoom?.smallBlind || 10;
    const bbAmount = gameRoom?.bigBlind || 20;

    const updatedPlayers = players.map((p) => {
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
        shownCards: p.seat_index === heroSeatIndex
      };
    });

    playCardDeal();

    const newHandNum = handState.handNumber + 1;
    setPlayers(updatedPlayers);
    setWinningCards([]);

    const utgPlayer = updatedPlayers.find(p => p.seat_index === utgSeat);
    setAnnouncement(`Hand #${newHandNum} Dealt • ${utgPlayer?.username}'s Turn`);

    setHandState({
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
    });
  };

  // Submit Player Action
  const handlePlayerAction = (action, amount = 0) => {
    const currentSeat = handState.currentTurnSeat;
    const playerIndex = players.findIndex((p) => p.seat_index === currentSeat);
    if (playerIndex === -1) return;

    const player = players[playerIndex];
    let updatedPlayers = [...players];
    let newMainPot = handState.mainPot;
    let newCurrentBet = handState.currentBet;
    let newMinRaise = handState.minRaise;

    if (action === 'fold') {
      playFold();
      updatedPlayers[playerIndex] = {
        ...player,
        status: 'folded',
        last_action: 'fold'
      };
      setAnnouncement(`${player.username} Folded`);
    } else if (action === 'check') {
      playCheckKnock();
      updatedPlayers[playerIndex] = {
        ...player,
        last_action: 'check'
      };
      setAnnouncement(`${player.username} Checked`);
    } else if (action === 'call') {
      playChipClink();
      const callDiff = Math.min(player.chips, handState.currentBet - player.current_round_bet);
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
      setAnnouncement(`${player.username} Called $${callDiff}`);
    } else if (action === 'bet' || action === 'raise') {
      playChipClink();
      const addBet = Math.min(player.chips, amount - player.current_round_bet);
      const newChips = player.chips - addBet;
      newMainPot += addBet;
      newMinRaise = Math.max(gameRoom?.bigBlind || 20, amount - handState.currentBet);
      newCurrentBet = amount;

      updatedPlayers[playerIndex] = {
        ...player,
        chips: newChips,
        current_round_bet: player.current_round_bet + addBet,
        total_hand_bet: player.total_hand_bet + addBet,
        status: newChips === 0 ? 'all_in' : 'active',
        last_action: action
      };
      setAnnouncement(`${player.username} ${action.toUpperCase()} to $${amount}`);
    }

    setPlayers(updatedPlayers);

    // Check if uncontested winner
    const remainingInHand = updatedPlayers.filter((p) => p.status === 'active' || p.status === 'all_in');
    if (remainingInHand.length === 1) {
      resolveUncontestedWinner(remainingInHand[0], newMainPot, updatedPlayers);
      return;
    }

    // Check if betting round complete
    const needToAct = updatedPlayers.filter(
      (p) => p.status === 'active' && (p.current_round_bet < newCurrentBet || !p.last_action)
    );

    if (needToAct.length === 0) {
      advanceStreet(updatedPlayers, newMainPot);
    } else {
      const nextSeat = getNextTurnSeat(currentSeat, updatedPlayers);
      const nextPlayer = updatedPlayers.find(p => p.seat_index === nextSeat);
      setHandState((prev) => ({
        ...prev,
        mainPot: newMainPot,
        currentBet: newCurrentBet,
        minRaise: newMinRaise,
        currentTurnSeat: nextSeat
      }));
      setAnnouncement(`${nextPlayer?.username}'s Turn`);
    }
  };

  const getNextTurnSeat = (fromSeat, playersList) => {
    const total = playersList.length;
    for (let i = 1; i <= total; i++) {
      const seat = (fromSeat + i) % total;
      const p = playersList.find((pl) => pl.seat_index === seat);
      if (p && p.status === 'active' && p.chips > 0) {
        return seat;
      }
    }
    return (fromSeat + 1) % total;
  };

  const advanceStreet = (playersList, currentPot) => {
    let nextPhase = 'flop';
    let newCommunity = [...handState.communityCards];
    let remainingDeck = [...handState.deck];

    playCardDeal();

    const resetPlayers = playersList.map((p) => ({
      ...p,
      current_round_bet: 0,
      last_action: p.status === 'folded' ? 'fold' : null
    }));

    if (handState.phase === 'preflop') {
      nextPhase = 'flop';
      remainingDeck.shift(); // burn
      newCommunity.push(remainingDeck.shift(), remainingDeck.shift(), remainingDeck.shift());
    } else if (handState.phase === 'flop') {
      nextPhase = 'turn';
      remainingDeck.shift();
      newCommunity.push(remainingDeck.shift());
    } else if (handState.phase === 'turn') {
      nextPhase = 'river';
      remainingDeck.shift();
      newCommunity.push(remainingDeck.shift());
    } else if (handState.phase === 'river') {
      resolveShowdown(resetPlayers, newCommunity, currentPot);
      return;
    }

    const firstActor = getNextTurnSeat(handState.dealerSeat, resetPlayers);
    const actorPlayer = resetPlayers.find(p => p.seat_index === firstActor);

    setPlayers(resetPlayers);
    setHandState((prev) => ({
      ...prev,
      phase: nextPhase,
      communityCards: newCommunity,
      deck: remainingDeck,
      currentBet: 0,
      minRaise: gameRoom?.bigBlind || 20,
      mainPot: currentPot,
      currentTurnSeat: firstActor
    }));
    setAnnouncement(`${nextPhase.toUpperCase()} Dealt • ${actorPlayer?.username}'s Turn`);
  };

  const resolveShowdown = (playersList, communityCards, totalPot) => {
    const contenders = playersList.filter((p) => p.status === 'active' || p.status === 'all_in');

    const evaluations = contenders.map((player) => {
      const allCards = [...player.cards, ...communityCards];
      const evaluation = evaluateHand(allCards);
      return { player, evaluation };
    });

    evaluations.sort((a, b) => {
      const scoreA = a.evaluation?.score || [0];
      const scoreB = b.evaluation?.score || [0];
      for (let i = 0; i < Math.max(scoreA.length, scoreB.length); i++) {
        const valA = scoreA[i] || 0;
        const valB = scoreB[i] || 0;
        if (valB !== valA) return valB - valA;
      }
      return 0;
    });

    const winner = evaluations[0].player;
    const bestEval = evaluations[0].evaluation;

    const revealedPlayers = playersList.map((p) => {
      const isContender = contenders.some((c) => c.seat_index === p.seat_index);
      if (p.seat_index === winner.seat_index) {
        return { ...p, chips: p.chips + totalPot, shownCards: true };
      }
      return isContender ? { ...p, shownCards: true } : p;
    });

    setPlayers(revealedPlayers);
    setAnnouncement(`🏆 ${winner.username} Wins $${totalPot} with ${bestEval.name}!`);
    playWinCelebration();

    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 }
    });

    setHandState((prev) => ({
      ...prev,
      phase: 'showdown',
      winners: [{ seat_index: winner.seat_index, amount: totalPot, handName: bestEval.name }]
    }));
  };

  const resolveUncontestedWinner = (winner, totalPot, playersList) => {
    const updated = playersList.map((p) => {
      if (p.seat_index === winner.seat_index) {
        return { ...p, chips: p.chips + totalPot };
      }
      return p;
    });

    setPlayers(updated);
    setAnnouncement(`🏆 ${winner.username} takes the pot of $${totalPot} (All folded)`);
    playWinCelebration();

    setHandState((prev) => ({
      ...prev,
      phase: 'ended',
      winners: [{ seat_index: winner.seat_index, amount: totalPot, handName: 'Uncontested' }]
    }));
  };

  const executeBotTurn = (bot) => {
    const toCall = handState.currentBet - bot.current_round_bet;
    const pot = handState.mainPot;
    const potOdds = toCall / (pot + toCall || 1);

    const allCards = [...bot.cards, ...handState.communityCards];
    const handEval = evaluateHand(allCards);
    const handStrengthTier = handEval.type;

    if (toCall === 0) {
      if (handStrengthTier >= 3 && Math.random() > 0.4) {
        handlePlayerAction('bet', Math.min(bot.chips, handState.currentBet + (gameRoom?.bigBlind || 20) * 2));
      } else {
        handlePlayerAction('check', 0);
      }
    } else {
      if (handStrengthTier >= 4 || (handStrengthTier >= 2 && potOdds < 0.35)) {
        if (handStrengthTier >= 6 && Math.random() > 0.5) {
          handlePlayerAction('raise', Math.min(bot.chips, handState.currentBet + handState.minRaise * 2));
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
    const currentP = players.find((p) => p.seat_index === handState.currentTurnSeat);
    if (!currentP) return;

    if (currentP.current_round_bet === handState.currentBet) {
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

  const heroPlayer = players.find((p) => p.seat_index === heroSeatIndex);
  const heroHandRank = heroPlayer?.cards?.length
    ? evaluateHand([...heroPlayer.cards, ...handState.communityCards])
    : null;

  const currentTurnPlayer = players.find((p) => p.seat_index === handState.currentTurnSeat);
  const isWaitingOrEnded = handState.phase === 'waiting' || handState.phase === 'ended' || handState.phase === 'showdown';

  return (
    <div className="table-viewport-container">
      {/* Top Table Header */}
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

        {/* Live Announcement Center Banner */}
        <div className="table-marquee-box">
          <span style={{ color: '#f59e0b', marginRight: '6px' }}>●</span>
          <span>{announcement}</span>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Host buttons: Add Bot & Start Hand */}
          {isWaitingOrEnded && (
            <>
              {players.length < (gameRoom?.maxPlayers || 6) && (
                <button
                  onClick={handleAddBot}
                  className="table-nav-btn"
                  style={{ background: '#1e293b', borderColor: '#475569' }}
                  title="Add AI Player"
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
        <div className="poker-table-outer">
          <div className="poker-table-brass-rim">
            <div className={`poker-table-felt-canvas ${feltTheme === 'emerald' ? 'felt-emerald' : 'felt-midnight'}`}>
              <div className="poker-betting-line" />

              {/* Waiting For Players / Host Deal Overlay Banner */}
              {isWaitingOrEnded && (
                <div className="poker-host-deal-banner">
                  <span style={{ fontSize: '11px', fontWeight: 900, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {handState.handNumber === 0 ? 'TABLE READY' : 'HAND COMPLETE'}
                  </span>
                  <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                    {players.length < 2
                      ? 'Waiting for at least 2 players to start'
                      : handState.handNumber === 0
                      ? 'Ready to deal cards!'
                      : 'Ready for the next hand!'}
                  </h3>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    {players.length < (gameRoom?.maxPlayers || 6) && (
                      <button
                        onClick={handleAddBot}
                        className="table-nav-btn"
                        style={{ padding: '10px 16px', fontSize: '13px' }}
                      >
                        <UserPlus className="w-4 h-4 text-indigo-400" />
                        <span>Add AI Bot</span>
                      </button>
                    )}

                    <button
                      onClick={startNewHand}
                      className="poker-deal-btn"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>{handState.handNumber === 0 ? 'DEAL FIRST HAND' : 'DEAL NEXT HAND'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Center Community Cards Area */}
              <CommunityArea
                communityCards={handState.communityCards}
                mainPot={handState.mainPot}
                sidePots={handState.sidePots}
                phase={handState.phase}
                winningCards={winningCards}
              />

              {/* Seated Players (Clean fixed-size pods, properly positioned) */}
              {players.map((player) => {
                const pos = getSeatCoordinates(player.seat_index, Math.max(players.length, gameRoom?.maxPlayers || 6), heroSeatIndex);
                const isWinner = handState.winners.some((w) => w.seat_index === player.seat_index);

                return (
                  <PlayerSeat
                    key={player.seat_index}
                    player={player}
                    seatIndex={player.seat_index}
                    position={pos}
                    isHero={player.seat_index === heroSeatIndex}
                    isDealer={player.seat_index === handState.dealerSeat}
                    isSB={player.seat_index === handState.sbSeat}
                    isBB={player.seat_index === handState.bbSeat}
                    isCurrentTurn={player.seat_index === handState.currentTurnSeat && !isWaitingOrEnded}
                    turnTimeLeft={turnTimeLeft}
                    turnMaxTime={turnMaxTime}
                    isWinner={isWinner}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Action HUD */}
      {!isWaitingOrEnded && (
        <PlayerHUD
          isMyTurn={handState.currentTurnSeat === heroSeatIndex}
          heroPlayer={heroPlayer}
          currentTurnPlayerName={currentTurnPlayer?.username}
          currentBet={handState.currentBet}
          minRaise={handState.minRaise}
          bigBlind={gameRoom?.bigBlind || 20}
          mainPot={handState.mainPot}
          handRank={heroHandRank}
          onAction={handlePlayerAction}
        />
      )}
    </div>
  );
};
