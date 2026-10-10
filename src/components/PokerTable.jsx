import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  VolumeX,
  ArrowLeft,
  Copy,
  Check,
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
  const [feltTheme, setFeltTheme] = useState('emerald'); // 'emerald' | 'midnight'
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [copiedCode, setCopiedCode] = useState(false);
  const heroSeatIndex = 0;

  // Core Game State
  const [players, setPlayers] = useState([]);
  const [handState, setHandState] = useState({
    handNumber: 1,
    phase: 'preflop', // preflop, flop, turn, river, showdown, ended
    communityCards: [],
    deck: [],
    currentTurnSeat: 0,
    dealerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    currentBet: gameRoom?.bigBlind || 20,
    minRaise: gameRoom?.bigBlind || 20,
    mainPot: (gameRoom?.smallBlind || 10) + (gameRoom?.bigBlind || 20),
    sidePots: [],
    winners: []
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(gameRoom?.turnTime || 25);
  const turnMaxTime = gameRoom?.turnTime || 25;
  const [winningCards, setWinningCards] = useState([]);
  const [announcement, setAnnouncement] = useState('New Hand Started');

  const turnTimerRef = useRef(null);

  // Initialize Players on Load
  useEffect(() => {
    const total = Math.max(3, Math.min(8, gameRoom?.maxPlayers || 6));
    const initialPlayers = [];

    // Hero player
    initialPlayers.push({
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

    // Other seated players (or Bots in practice / initial room)
    for (let i = 1; i < total; i++) {
      initialPlayers.push({
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

    setPlayers(initialPlayers);
    startNewHand(initialPlayers, 0, 1);
  }, [gameRoom, user]);

  // Turn Countdown Timer
  useEffect(() => {
    if (handState.phase === 'ended' || handState.phase === 'showdown') return;

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

  // Bot Turn Execution
  useEffect(() => {
    const activePlayer = players.find((p) => p.seat_index === handState.currentTurnSeat);
    if (!activePlayer || !activePlayer.isBot || handState.phase === 'ended' || handState.phase === 'showdown') {
      return;
    }

    const timer = setTimeout(() => {
      executeBotTurn(activePlayer);
    }, 1200 + Math.random() * 800);

    return () => clearTimeout(timer);
  }, [handState.currentTurnSeat, handState.phase, players]);

  // Generate and Shuffle Deck
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

  // Start New Hand
  const startNewHand = (currentPlayersList, prevDealerSeat = 0, handNum = 1) => {
    const activeList = currentPlayersList.filter((p) => p.chips > 0);
    if (activeList.length < 2) {
      setAnnouncement('Game Over! Not enough players with chips.');
      return;
    }

    const deck = generateDeck();
    let deckIdx = 0;

    const nextDealerSeat = (prevDealerSeat + 1) % currentPlayersList.length;
    const sbSeat = (nextDealerSeat + 1) % currentPlayersList.length;
    const bbSeat = (nextDealerSeat + 2) % currentPlayersList.length;
    const utgSeat = (nextDealerSeat + 3) % currentPlayersList.length;

    const sbAmount = gameRoom?.smallBlind || 10;
    const bbAmount = gameRoom?.bigBlind || 20;

    const updatedPlayers = currentPlayersList.map((p) => {
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

    setPlayers(updatedPlayers);
    setWinningCards([]);
    setAnnouncement(`Hand #${handNum} Started (Blinds $${sbAmount}/$${bbAmount})`);

    setHandState({
      handNumber: handNum,
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

    // Check if uncontested
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
      setHandState((prev) => ({
        ...prev,
        mainPot: newMainPot,
        currentBet: newCurrentBet,
        minRaise: newMinRaise,
        currentTurnSeat: nextSeat
      }));
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
      remainingDeck.shift(); // burn 1
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
    setAnnouncement(`Phase: ${nextPhase.toUpperCase()}`);
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

    setTimeout(() => {
      startNewHand(revealedPlayers, handState.dealerSeat, handState.handNumber + 1);
    }, 4500);
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

    setTimeout(() => {
      startNewHand(updated, handState.dealerSeat, handState.handNumber + 1);
    }, 3500);
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

  return (
    <div className="table-viewport-container">
      {/* Top Table Header */}
      <header className="table-header-bar">
        <div className="flex items-center space-x-3">
          <button
            onClick={onLeaveTable}
            className="table-nav-btn table-back-btn"
            title="Leave Table"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Lobby</span>
          </button>

          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-extrabold text-white truncate max-w-[140px]">
              {gameRoom?.roomName || 'Poker Room'}
            </h2>
            <button
              onClick={copyRoomCode}
              className="table-code-badge"
              title="Click to copy code"
            >
              <span>{gameRoom?.roomCode || 'CODE'}</span>
              {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Live Announcement Center Banner */}
        <div className="table-marquee-box">
          <span className="text-amber-400 mr-2 font-black">●</span>
          <span>{announcement}</span>
        </div>

        {/* Utility Controls */}
        <div className="flex items-center space-x-2">
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
            title="Toggle Sound"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>
        </div>
      </header>

      {/* Main Table Felt Stage */}
      <main className="table-stage">
        {/* Real Oval Table Outer Border */}
        <div className="poker-table-outer">
          {/* Brass Bevel Rim */}
          <div className="poker-table-brass-rim">
            {/* The Actual Felt Canvas */}
            <div className={`poker-table-felt-canvas ${feltTheme === 'emerald' ? 'felt-emerald' : 'felt-midnight'}`}>
              {/* Inner Betting Line */}
              <div className="poker-betting-line" />

              {/* Center Community Area */}
              <CommunityArea
                communityCards={handState.communityCards}
                mainPot={handState.mainPot}
                sidePots={handState.sidePots}
                phase={handState.phase}
                winningCards={winningCards}
              />

              {/* Seated Players Distributed via Elliptical Math */}
              {players.map((player) => {
                const pos = getSeatCoordinates(player.seat_index, players.length, heroSeatIndex);
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
                    isCurrentTurn={player.seat_index === handState.currentTurnSeat}
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
      <PlayerHUD
        isMyTurn={handState.currentTurnSeat === heroSeatIndex}
        heroPlayer={heroPlayer}
        currentBet={handState.currentBet}
        minRaise={handState.minRaise}
        bigBlind={gameRoom?.bigBlind || 20}
        mainPot={handState.mainPot}
        handRank={heroHandRank}
        onAction={handlePlayerAction}
      />
    </div>
  );
};
