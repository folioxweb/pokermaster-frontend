import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Volume2, VolumeX, RefreshCw, Settings, Info, ShieldCheck } from 'lucide-react';
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
  gameConfig = { username: 'Parth', playerCount: 6, startingStack: 1500 },
  onOpenLobby = null
}) => {
  const [feltTheme, setFeltTheme] = useState('emerald'); // 'emerald' | 'midnight'
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [heroSeatIndex, setHeroSeatIndex] = useState(0);

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
    currentBet: 20,
    minRaise: 20,
    mainPot: 30,
    sidePots: [],
    winners: []
  });

  const [turnTimeLeft, setTurnTimeLeft] = useState(20);
  const turnMaxTime = 20;
  const [winningCards, setWinningCards] = useState([]);
  const [announcement, setAnnouncement] = useState('New Hand Started');

  const turnTimerRef = useRef(null);

  // Initialize Players on Load
  useEffect(() => {
    const total = Math.max(3, Math.min(8, gameConfig.playerCount || 6));
    const initialPlayers = [];

    // Hero player
    initialPlayers.push({
      seat_index: 0,
      username: gameConfig.username || 'Hero',
      chips: gameConfig.startingStack || 1500,
      current_round_bet: 0,
      total_hand_bet: 0,
      status: 'active',
      last_action: null,
      cards: [],
      shownCards: true,
      isBot: false
    });

    // Bot players
    for (let i = 1; i < total; i++) {
      initialPlayers.push({
        seat_index: i,
        username: BOT_NAMES[i - 1] || `Player ${i + 1}`,
        chips: gameConfig.startingStack || 1500,
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
  }, [gameConfig]);

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

  // AI Bot Turn Execution
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

  // Helper to build and shuffle deck
  const generateDeck = () => {
    const suits = ['s', 'h', 'd', 'c'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const s of suits) {
      for (const r of ranks) {
        deck.push(`${r}${s}`);
      }
    }
    // Fisher-Yates shuffle
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

    // Move dealer button clockwise
    const nextDealerSeat = (prevDealerSeat + 1) % currentPlayersList.length;
    const sbSeat = (nextDealerSeat + 1) % currentPlayersList.length;
    const bbSeat = (nextDealerSeat + 2) % currentPlayersList.length;
    const utgSeat = (nextDealerSeat + 3) % currentPlayersList.length;

    const sbAmount = 10;
    const bbAmount = 20;

    // Reset players & deal cards
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
    setAnnouncement(`Hand #${handNum} Started (Blinds $10/$20)`);

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

  // Submit Player Action (Hero or Bot)
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
      newMinRaise = Math.max(20, amount - handState.currentBet);
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

    // Check if only 1 active player remains (uncontested pot)
    const remainingInHand = updatedPlayers.filter((p) => p.status === 'active' || p.status === 'all_in');
    if (remainingInHand.length === 1) {
      resolveUncontestedWinner(remainingInHand[0], newMainPot, updatedPlayers);
      return;
    }

    // Check if betting round is complete
    const needToAct = updatedPlayers.filter(
      (p) => p.status === 'active' && (p.current_round_bet < newCurrentBet || !p.last_action)
    );

    if (needToAct.length === 0) {
      // Advance to next street
      advanceStreet(updatedPlayers, newMainPot);
    } else {
      // Move to next player
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

  // Get Next Active Seat Clockwise
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

  // Advance Street (Flop -> Turn -> River -> Showdown)
  const advanceStreet = (playersList, currentPot) => {
    let nextPhase = 'flop';
    let newCommunity = [...handState.communityCards];
    let remainingDeck = [...handState.deck];

    playCardDeal();

    // Reset round bets
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
      remainingDeck.shift(); // burn 1
      newCommunity.push(remainingDeck.shift());
    } else if (handState.phase === 'turn') {
      nextPhase = 'river';
      remainingDeck.shift(); // burn 1
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
      minRaise: 20,
      mainPot: currentPot,
      currentTurnSeat: firstActor
    }));
    setAnnouncement(`Phase: ${nextPhase.toUpperCase()}`);
  };

  // Resolve Showdown at River
  const resolveShowdown = (playersList, communityCards, totalPot) => {
    const contenders = playersList.filter((p) => p.status === 'active' || p.status === 'all_in');

    // Evaluate hand for each player
    const evaluations = contenders.map((player) => {
      const allCards = [...player.cards, ...communityCards];
      const evaluation = evaluateHand(allCards);
      return {
        player,
        evaluation
      };
    });

    // Sort to find best hand
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

    // Reveal cards for contenders at showdown
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
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });

    setHandState((prev) => ({
      ...prev,
      phase: 'showdown',
      winners: [{ seat_index: winner.seat_index, amount: totalPot, handName: bestEval.name }]
    }));

    // Auto deal next hand after delay
    setTimeout(() => {
      startNewHand(revealedPlayers, handState.dealerSeat, handState.handNumber + 1);
    }, 4500);
  };

  // Resolve Uncontested Winner (All folded except one)
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

  // Bot Decision Logic (Simulated AI)
  const executeBotTurn = (bot) => {
    const toCall = handState.currentBet - bot.current_round_bet;
    const pot = handState.mainPot;
    const potOdds = toCall / (pot + toCall || 1);

    // Hand evaluation approximation
    const allCards = [...bot.cards, ...handState.communityCards];
    const handEval = evaluateHand(allCards);
    const handStrengthTier = handEval.type; // 1 to 10

    if (toCall === 0) {
      // Free action: 80% check, 20% small bet if decent hand
      if (handStrengthTier >= 3 && Math.random() > 0.4) {
        handlePlayerAction('bet', Math.min(bot.chips, handState.currentBet + 40));
      } else {
        handlePlayerAction('check', 0);
      }
    } else {
      // Facing a bet
      if (handStrengthTier >= 4 || (handStrengthTier >= 2 && potOdds < 0.35)) {
        // Strong hand or good odds
        if (handStrengthTier >= 6 && Math.random() > 0.5) {
          handlePlayerAction('raise', Math.min(bot.chips, handState.currentBet + handState.minRaise * 2));
        } else {
          handlePlayerAction('call', toCall);
        }
      } else if (potOdds < 0.15 || Math.random() < 0.25) {
        // Cheap call or occasional float
        handlePlayerAction('call', toCall);
      } else {
        // Fold
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

  // Hero hand evaluation preview
  const heroPlayer = players.find((p) => p.seat_index === heroSeatIndex);
  const heroHandRank = heroPlayer?.cards?.length
    ? evaluateHand([...heroPlayer.cards, ...handState.communityCards])
    : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col justify-between bg-slate-950 font-sans select-none">
      {/* Top Navigation Bar */}
      <header className="relative z-30 flex items-center justify-between px-6 py-3 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <h1 className="text-base font-black tracking-wider text-white">
              POKERMASTER
            </h1>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Hand #{handState.handNumber}
          </span>
        </div>

        {/* Live Announcement Marquee */}
        <div className="hidden md:flex items-center px-4 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-bold text-amber-300">
          {announcement}
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2">
          {/* Felt theme toggle */}
          <button
            onClick={() => setFeltTheme(feltTheme === 'emerald' ? 'midnight' : 'emerald')}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
            title="Toggle Felt Color"
          >
            {feltTheme === 'emerald' ? '🟢 Velvet' : '🔵 Midnight'}
          </button>

          {/* Sound toggle */}
          <button
            onClick={() => setSoundOn(toggleSound())}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition cursor-pointer"
            title="Toggle Audio"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-rose-400" />}
          </button>

          {/* Table Settings / Lobby */}
          <button
            onClick={onOpenLobby}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition cursor-pointer"
            title="Lobby Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Poker Table Area (Elliptical Felt) */}
      <main className="relative flex-1 flex items-center justify-center p-4">
        {/* The Outer Elliptical Table Rail & Padded Leather Bumper */}
        <div
          className={`relative w-[92vw] max-w-[1050px] aspect-[16/9] rounded-[48%/44%] p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] transition-colors duration-500 border-8 ${
            feltTheme === 'emerald'
              ? 'bg-gradient-to-b from-amber-950 via-amber-900 to-amber-950 border-amber-800/80 shadow-emerald-950/40'
              : 'bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 border-slate-700 shadow-blue-950/40'
          }`}
        >
          {/* Inner Brass Rim Inlay */}
          <div className="relative w-full h-full rounded-[47%/43%] p-2 bg-gradient-to-tr from-amber-600/40 to-yellow-300/30">
            {/* The Felt Canvas Surface */}
            <div
              className={`relative w-full h-full rounded-[46%/42%] overflow-hidden shadow-inner flex items-center justify-center transition-all duration-700 ${
                feltTheme === 'emerald'
                  ? 'bg-[radial-gradient(ellipse_at_center,_#065f46_0%,_#044e3a_40%,_#022c22_100%)]'
                  : 'bg-[radial-gradient(ellipse_at_center,_#1e293b_0%,_#0f172a_50%,_#020617_100%)]'
              }`}
            >
              {/* Table Felt Subtle Texture & Betting Ring */}
              <div
                className={`absolute inset-7 rounded-[46%/42%] border-2 pointer-events-none ${
                  feltTheme === 'emerald' ? 'border-amber-400/20' : 'border-sky-400/20'
                }`}
              />

              {/* Center Community Cards & Pot Area */}
              <CommunityArea
                communityCards={handState.communityCards}
                mainPot={handState.mainPot}
                sidePots={handState.sidePots}
                phase={handState.phase}
                winningCards={winningCards}
              />

              {/* Seated Players (Distributed Responsively via Elliptical Math) */}
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

      {/* Bottom Player Action HUD */}
      <PlayerHUD
        isMyTurn={handState.currentTurnSeat === heroSeatIndex}
        heroPlayer={heroPlayer}
        currentBet={handState.currentBet}
        minRaise={handState.minRaise}
        bigBlind={20}
        mainPot={handState.mainPot}
        handRank={heroHandRank}
        onAction={handlePlayerAction}
      />
    </div>
  );
};
