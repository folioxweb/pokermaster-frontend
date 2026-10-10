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
import { evaluateHand } from '../lib/pokerEvaluator';
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

  const [turnTimeLeft, setTurnTimeLeft] = useState(gameRoom?.turnTime || 25);
  const turnMaxTime = gameRoom?.turnTime || 25;
  const [winningCards, setWinningCards] = useState([]);
  const [announcement, setAnnouncement] = useState('Waiting for host to start hand');

  // Animation & Interaction states
  const [flyingChips, setFlyingChips] = useState([]);
  const [isPotPulsing, setIsPotPulsing] = useState(false);
  const [heroShowCardsClicked, setHeroShowCardsClicked] = useState(false);

  const channelRef = useRef(null);
  const turnTimerRef = useRef(null);

  // Initialize Seated Players & Supabase Realtime Channel
  useEffect(() => {
    const totalMax = Math.max(3, Math.min(8, gameRoom?.maxPlayers || 6));
    let initialList = [];

    // Current user sits at Seat 0 by default
    const heroPlayer = {
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
    };

    initialList.push(heroPlayer);
    setMySeatIndex(0);

    if (gameRoom?.isPractice) {
      // In Practice mode: pre-fill bots for solo training
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
      setAnnouncement(`Practice Mode (${totalMax} Players) • Click "Deal Hand" to start`);
    } else {
      setAnnouncement(`Share Code ${gameRoom?.roomCode} • Waiting for players to join`);
    }

    setPlayers(initialList);

    // Setup Supabase Realtime Broadcast Channel for Live Multiplayer
    const roomCode = gameRoom?.roomCode || 'SOLO';
    const channel = supabase.channel(`poker_room_${roomCode}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'SEAT_TAKEN' }, ({ payload }) => {
        setPlayers((prev) => {
          if (prev.some(p => p.seat_index === payload.seat_index)) return prev;
          return [...prev, payload];
        });
        setAnnouncement(`${payload.username} joined the table!`);
      })
      .on('broadcast', { event: 'HAND_DEALT' }, ({ payload }) => {
        playCardDeal();
        setHandState(payload.handState);
        setPlayers(payload.players);
        setWinningCards([]);
        setAnnouncement(payload.announcement);
      })
      .on('broadcast', { event: 'PLAYER_ACTION_EVENT' }, ({ payload }) => {
        handleReceivedPlayerAction(payload.action, payload.amount, payload.seatIndex);
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
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
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

    const timer = setTimeout(() => {
      executeBotTurn(activePlayer);
    }, 2200);

    return () => clearTimeout(timer);
  }, [handState.currentTurnSeat, handState.phase, players]);

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

  // Option for Hero to reveal cards at end of hand
  const handleShowHeroCards = () => {
    const hero = players.find(p => p.seat_index === mySeatIndex);
    if (!hero || !hero.cards || hero.cards.length === 0) return;
    setHeroShowCardsClicked(true);
    setPlayers((prev) =>
      prev.map((p) => (p.seat_index === mySeatIndex ? { ...p, shownCards: true } : p))
    );
    setAnnouncement(`👁️ You revealed your cards to the table!`);

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'PLAYER_SHOW_CARDS',
        payload: {
          seatIndex: mySeatIndex,
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

  // START HAND (Strict Clockwise Blinds Rotation: Dealer -> SB -> BB -> UTG)
  const startNewHand = () => {
    if (players.length < 2) {
      alert('At least 2 players are needed to start a hand. Invite a friend with the room code or click "+ Add Bot"!');
      return;
    }

    const activeList = players.filter((p) => p.chips > 0);
    if (activeList.length < 2) {
      setAnnouncement('Not enough players with points remaining!');
      return;
    }

    const deck = generateDeck();
    let deckIdx = 0;

    // Advance Dealer button 1 active seat clockwise
    const nextDealerSeat = (handState.dealerSeat + 1) % players.length;
    
    let sbSeat, bbSeat, utgSeat;
    if (players.length === 2) {
      // Heads-Up: Dealer is Small Blind and acts first pre-flop
      sbSeat = nextDealerSeat;
      bbSeat = (nextDealerSeat + 1) % 2;
      utgSeat = nextDealerSeat;
    } else {
      // 3 to 8 players Ring Game
      sbSeat = (nextDealerSeat + 1) % players.length;
      bbSeat = (nextDealerSeat + 2) % players.length;
      utgSeat = (nextDealerSeat + 3) % players.length;
    }

    setHeroShowCardsClicked(false);

    const newHandNum = handState.handNumber + 1;
    let sbAmount = gameRoom?.smallBlind || 10;
    let bbAmount = gameRoom?.bigBlind || 20;

    // Apply blinds escalation frequency from custom options
    const freq = gameRoom?.blindsFrequency || 'fast_5';
    let multiplier = 1;
    if (freq === 'fast_5' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 5));
    } else if (freq === 'standard_10' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 10));
    } else if (freq === 'slow_15' && newHandNum > 1) {
      multiplier = Math.pow(2, Math.floor((newHandNum - 1) / 15));
    }
    sbAmount = sbAmount * multiplier;
    bbAmount = bbAmount * multiplier;

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
        shownCards: p.user_id === user?.id
      };
    });

    playCardDeal();

    const utgPlayer = updatedPlayers.find(p => p.seat_index === utgSeat);
    const initialAnnouncement = `Hand #${newHandNum} Dealt • Blinds: ${formatPoints(sbAmount)} / ${formatPoints(bbAmount)} • ${utgPlayer?.username}'s Turn`;

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

    setPlayers(updatedPlayers);
    setWinningCards([]);
    setAnnouncement(initialAnnouncement);
    setHandState(newHandState);

    // Broadcast hand start to all connected live players
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'HAND_DEALT',
        payload: {
          handState: newHandState,
          players: updatedPlayers,
          announcement: initialAnnouncement
        }
      });
    }
  };

  // Submit Player Action (Hero or local execution)
  const handlePlayerAction = (action, amount = 0) => {
    const currentSeat = handState.currentTurnSeat;
    executeActionLogic(action, amount, currentSeat);

    // Broadcast action to other live multiplayer participants
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'PLAYER_ACTION_EVENT',
        payload: {
          action,
          amount,
          seatIndex: currentSeat
        }
      });
    }
  };

  // Received Action from other player via Realtime
  const handleReceivedPlayerAction = (action, amount, seatIndex) => {
    executeActionLogic(action, amount, seatIndex);
  };

  // Core Betting Logic (Check, Call, Bet, Raise, Fold, Blinds Option)
  const executeActionLogic = (action, amount, currentSeat) => {
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
      setAnnouncement(`${player.username} Called ${formatPoints(callDiff)}`);
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
      setAnnouncement(`${player.username} ${action.toUpperCase()} to ${formatPoints(amount)}`);
    }

    setPlayers(updatedPlayers);

    // Check for uncontested winner (all folded except one)
    const remainingInHand = updatedPlayers.filter((p) => p.status === 'active' || p.status === 'all_in');
    if (remainingInHand.length === 1) {
      resolveUncontestedWinner(remainingInHand[0], newMainPot, updatedPlayers);
      return;
    }

    // Check if betting round complete (everyone matched currentBet or is all-in)
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

    triggerChipsFlight(playersList);
    playCardDeal();

    // Reset round bets
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

    // Postflop action starts with first active player clockwise from Dealer Button (typically SB)
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
    setAnnouncement(`🏆 ${winner.username} Wins ${formatPoints(totalPot)} with ${bestEval.name}!`);
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
    triggerChipsFlight(playersList);

    const updated = playersList.map((p) => {
      if (p.seat_index === winner.seat_index) {
        return { ...p, chips: p.chips + totalPot };
      }
      return p;
    });

    setPlayers(updated);
    setAnnouncement(`🏆 ${winner.username} takes ${formatPoints(totalPot)} (All folded)`);
    playWinCelebration();

    let finalCommunity = [...handState.communityCards];
    if (gameRoom?.showRemainingRiverCards && finalCommunity.length < 5) {
      const remainingDeck = [...handState.deck];
      const needed = 5 - finalCommunity.length;
      finalCommunity = [...finalCommunity, ...remainingDeck.slice(0, needed)];
    }

    setHandState((prev) => ({
      ...prev,
      phase: 'ended',
      communityCards: finalCommunity,
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
                    isDealer={player.seat_index === handState.dealerSeat}
                    isSB={player.seat_index === handState.sbSeat}
                    isBB={player.seat_index === handState.bbSeat}
                    isCurrentTurn={player.seat_index === handState.currentTurnSeat && !isWaitingOrEnded}
                    turnTimeLeft={turnTimeLeft}
                    turnMaxTime={turnMaxTime}
                    isWinner={isWinner}
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
