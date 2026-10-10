// High-performance Texas Hold'em 5-of-7 Hand Evaluator in pure JavaScript

const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const RANK_NAMES = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine',
  10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace'
};

const RANK_PLURALS = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines',
  10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces'
};

export const HAND_TYPES = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

// Parse card string like "As", "Kh", "Td" into { rankValue, rankChar, suit }
function parseCard(cardStr) {
  if (!cardStr || cardStr.length < 2) return null;
  const rankChar = cardStr[0].toUpperCase();
  const suit = cardStr[1].toLowerCase();
  return {
    raw: cardStr,
    rankChar,
    rankValue: RANK_VALUES[rankChar] || 0,
    suit
  };
}

// Generate all combinations of k items from array
function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const head = arr[0];
  const tail = arr.slice(1);
  const withHead = getCombinations(tail, k - 1).map(comb => [head, ...comb]);
  const withoutHead = getCombinations(tail, k);
  return [...withHead, ...withoutHead];
}

// Evaluate exactly 5 cards
function evaluate5Cards(cards) {
  const sorted = [...cards].sort((a, b) => b.rankValue - a.rankValue);
  const rankCounts = {};
  const suitCounts = {};

  sorted.forEach(c => {
    rankCounts[c.rankValue] = (rankCounts[c.rankValue] || 0) + 1;
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });

  const isFlush = Object.values(suitCounts).some(cnt => cnt === 5);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  const uniqueRanks = [...new Set(sorted.map(c => c.rankValue))];
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      // Ace-low straight (A-2-3-4-5 / Wheel)
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Count groups
  const counts = Object.entries(rankCounts)
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  // 1. Royal Flush & Straight Flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return {
        type: HAND_TYPES.ROYAL_FLUSH,
        score: [HAND_TYPES.ROYAL_FLUSH, 14],
        name: 'Royal Flush',
        description: 'Royal Flush'
      };
    }
    return {
      type: HAND_TYPES.STRAIGHT_FLUSH,
      score: [HAND_TYPES.STRAIGHT_FLUSH, straightHigh],
      name: 'Straight Flush',
      description: `Straight Flush, ${RANK_NAMES[straightHigh]} High`
    };
  }

  // 2. Four of a kind
  if (counts[0].count === 4) {
    const quadRank = counts[0].rank;
    const kicker = counts[1].rank;
    return {
      type: HAND_TYPES.FOUR_OF_A_KIND,
      score: [HAND_TYPES.FOUR_OF_A_KIND, quadRank, kicker],
      name: 'Four of a Kind',
      description: `Four of a Kind, ${RANK_PLURALS[quadRank]}`
    };
  }

  // 3. Full House
  if (counts[0].count === 3 && counts[1].count === 2) {
    const trips = counts[0].rank;
    const pair = counts[1].rank;
    return {
      type: HAND_TYPES.FULL_HOUSE,
      score: [HAND_TYPES.FULL_HOUSE, trips, pair],
      name: 'Full House',
      description: `Full House, ${RANK_PLURALS[trips]} full of ${RANK_PLURALS[pair]}`
    };
  }

  // 4. Flush
  if (isFlush) {
    const kickers = sorted.map(c => c.rankValue);
    return {
      type: HAND_TYPES.FLUSH,
      score: [HAND_TYPES.FLUSH, ...kickers],
      name: 'Flush',
      description: `Flush, ${RANK_NAMES[kickers[0]]} High`
    };
  }

  // 5. Straight
  if (isStraight) {
    return {
      type: HAND_TYPES.STRAIGHT,
      score: [HAND_TYPES.STRAIGHT, straightHigh],
      name: 'Straight',
      description: `Straight, ${RANK_NAMES[straightHigh]} High`
    };
  }

  // 6. Three of a kind
  if (counts[0].count === 3) {
    const trips = counts[0].rank;
    const kickers = [counts[1].rank, counts[2].rank];
    return {
      type: HAND_TYPES.THREE_OF_A_KIND,
      score: [HAND_TYPES.THREE_OF_A_KIND, trips, ...kickers],
      name: 'Three of a Kind',
      description: `Three of a Kind, ${RANK_PLURALS[trips]}`
    };
  }

  // 7. Two Pair
  if (counts[0].count === 2 && counts[1].count === 2) {
    const highPair = counts[0].rank;
    const lowPair = counts[1].rank;
    const kicker = counts[2].rank;
    return {
      type: HAND_TYPES.TWO_PAIR,
      score: [HAND_TYPES.TWO_PAIR, highPair, lowPair, kicker],
      name: 'Two Pair',
      description: `Two Pair, ${RANK_PLURALS[highPair]} and ${RANK_PLURALS[lowPair]}`
    };
  }

  // 8. One Pair
  if (counts[0].count === 2) {
    const pair = counts[0].rank;
    const kickers = [counts[1].rank, counts[2].rank, counts[3].rank];
    return {
      type: HAND_TYPES.ONE_PAIR,
      score: [HAND_TYPES.ONE_PAIR, pair, ...kickers],
      name: 'One Pair',
      description: `Pair of ${RANK_PLURALS[pair]}, ${RANK_NAMES[kickers[0]]} Kicker`
    };
  }

  // 9. High Card
  const kickers = sorted.map(c => c.rankValue);
  return {
    type: HAND_TYPES.HIGH_CARD,
    score: [HAND_TYPES.HIGH_CARD, ...kickers],
    name: 'High Card',
    description: `High Card, ${RANK_NAMES[kickers[0]]}`
  };
}

// Compare two evaluation scores array lexicographically
export function compareScores(scoreA, scoreB) {
  const maxLen = Math.max(scoreA?.length || 0, scoreB?.length || 0);
  for (let i = 0; i < maxLen; i++) {
    const a = scoreA?.[i] || 0;
    const b = scoreB?.[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// Evaluate 5, 6, or 7 cards (hole cards + community cards)
export function evaluateHand(cardStrings) {
  if (!cardStrings || cardStrings.length < 5) {
    // If only hole cards (2 cards), evaluate starting hand
    if (cardStrings && cardStrings.length === 2) {
      const c1 = parseCard(cardStrings[0]);
      const c2 = parseCard(cardStrings[1]);
      if (c1 && c2) {
        if (c1.rankValue === c2.rankValue) {
          return {
            type: HAND_TYPES.ONE_PAIR,
            name: 'Pocket Pair',
            description: `Pocket ${RANK_PLURALS[c1.rankValue]}`,
            cards: cardStrings
          };
        }
        const high = Math.max(c1.rankValue, c2.rankValue);
        const low = Math.min(c1.rankValue, c2.rankValue);
        const suited = c1.suit === c2.suit ? 'Suited' : 'Offsuit';
        return {
          type: HAND_TYPES.HIGH_CARD,
          name: 'Starting Hand',
          description: `${RANK_NAMES[high]}-${RANK_NAMES[low]} ${suited}`,
          cards: cardStrings
        };
      }
    }
    return { type: 0, name: '', description: '', cards: [] };
  }

  const parsed = cardStrings.map(parseCard).filter(Boolean);
  if (parsed.length < 5) return { type: 0, name: '', description: '', cards: [] };

  const all5CardCombos = getCombinations(parsed, 5);
  let bestEval = null;

  for (const combo of all5CardCombos) {
    const currentEval = evaluate5Cards(combo);
    if (!bestEval || compareScores(currentEval.score, bestEval.score) > 0) {
      bestEval = {
        ...currentEval,
        cards: combo.map(c => c.raw)
      };
    }
  }

  return bestEval;
}

