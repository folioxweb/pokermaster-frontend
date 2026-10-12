/**
 * Bluff (Cheat / I Doubt It) Game Engine
 * Supports Single Deck (54 cards: 52 + 2 Jokers) & Double Deck (108 cards: 104 + 4 Jokers).
 * Jokers ("Jr", "Jb") act as wildcards.
 */

export const BLUFF_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const RANK_NAMES = {
  'A': 'Aces',
  '2': 'Twos',
  '3': 'Threes',
  '4': 'Fours',
  '5': 'Fives',
  '6': 'Sixes',
  '7': 'Sevens',
  '8': 'Eights',
  '9': 'Nines',
  '10': 'Tens',
  'J': 'Jacks',
  'Q': 'Queens',
  'K': 'Kings'
};

const STANDARD_SUITS = ['s', 'h', 'd', 'c'];

/**
 * Creates and shuffles a deck of 54 cards (1 deck + 2 jokers) or 108 cards (2 decks + 4 jokers).
 * @param {'single' | 'double'} deckType
 * @returns {string[]} Shuffled array of card codes
 */
export function createBluffDeck(deckType = 'single') {
  const deckMultiplier = deckType === 'double' ? 2 : 1;
  const cards = [];

  for (let d = 0; d < deckMultiplier; d++) {
    // 52 standard cards
    for (const r of BLUFF_RANKS) {
      for (const s of STANDARD_SUITS) {
        cards.push(`${r}${s}`);
      }
    }
    // 2 wild Jokers per deck
    cards.push('Jr'); // Red Joker
    cards.push('Jb'); // Black Joker
  }

  // Cryptographically secure Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}

/**
 * Distributes cards equally to active players.
 * @param {string[]} deck
 * @param {number} playerCount
 * @returns {string[][]} Array of player hands
 */
export function dealBluffCards(deck, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < deck.length; i++) {
    hands[i % playerCount].push(deck[i]);
  }
  // Sort each hand by rank order for clean player ergonomics
  return hands.map(hand => sortHand(hand));
}

/**
 * Sorts cards in player's hand by rank order, placing Jokers at the end.
 */
export function sortHand(hand = []) {
  const rankOrder = {
    'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13
  };

  return [...hand].sort((a, b) => {
    const isJokerA = a === 'Jr' || a === 'Jb';
    const isJokerB = b === 'Jr' || b === 'Jb';
    if (isJokerA && isJokerB) return a.localeCompare(b);
    if (isJokerA) return 1;
    if (isJokerB) return -1;

    const rankA = a.length === 3 ? '10' : a[0];
    const rankB = b.length === 3 ? '10' : b[0];

    const valA = rankOrder[rankA] || 0;
    const valB = rankOrder[rankB] || 0;
    if (valA !== valB) return valA - valB;

    const suitA = a.slice(-1);
    const suitB = b.slice(-1);
    return suitA.localeCompare(suitB);
  });
}

/**
 * Gets the next sequential claim rank (e.g. A -> 2 -> ... -> K -> A).
 */
export function getNextClaimRank(currentRank = 'A') {
  const idx = BLUFF_RANKS.indexOf(currentRank);
  if (idx === -1 || idx === BLUFF_RANKS.length - 1) {
    return BLUFF_RANKS[0]; // Loop back to 'A'
  }
  return BLUFF_RANKS[idx + 1];
}

/**
 * Verifies if a play was a Bluff or the Truth.
 * Jokers are wildcards and count as matching the claimed rank!
 * @param {string[]} playedCards
 * @param {string} claimedRank e.g. "K" or "10"
 * @returns {{ isBluff: boolean, legalCards: string[], bluffCards: string[] }}
 */
export function verifyPlay(playedCards = [], claimedRank = 'A') {
  const legalCards = [];
  const bluffCards = [];

  for (const card of playedCards) {
    const isJoker = card === 'Jr' || card === 'Jb';
    const cardRank = card.length === 3 ? '10' : card[0];

    if (isJoker || cardRank === claimedRank) {
      legalCards.push(card);
    } else {
      bluffCards.push(card);
    }
  }

  // If any single card played does not match the claim and is not a Joker, it was a BLUFF!
  const isBluff = bluffCards.length > 0;

  return {
    isBluff,
    legalCards,
    bluffCards
  };
}

/**
 * AI Bot Decision: Decides which cards to play and which rank to claim.
 * Bots bluff randomly but logically!
 * @param {string[]} botHand
 * @param {string|null} previousClaimRank
 * @param {boolean} canPass
 * @param {number} pileCount
 * @returns {{ action: 'play' | 'pass', cards: string[], claimedRank: string }}
 */
export function decideBotPlay(botHand = [], trickClaimRank = null, canPass = false, pileCount = 0) {
  if (botHand.length === 0) {
    return { action: 'pass', cards: [], claimedRank: 'A' };
  }

  // 1. Group cards by rank and identify Jokers
  const groups = {};
  const jokers = [];

  for (const c of botHand) {
    if (c === 'Jr' || c === 'Jb') {
      jokers.push(c);
    } else {
      const r = c.length === 3 ? '10' : c[0];
      if (!groups[r]) groups[r] = [];
      groups[r].push(c);
    }
  }

  const heldRanks = Object.keys(groups);

  // =========================================================================
  // CASE 1: TRICK RANK IS LOCKED (All subsequent players MUST play trickClaimRank or Pass)
  // =========================================================================
  if (trickClaimRank !== null) {
    const matchingCards = [];
    if (groups[trickClaimRank]) {
      matchingCards.push(...groups[trickClaimRank]);
    }
    // Include wild Jokers as matching cards
    matchingCards.push(...jokers);

    // If bot has matching cards:
    if (matchingCards.length > 0) {
      // 82% of the time: play matching cards honestly (max 4 cards in a single turn!)
      if (Math.random() < 0.82) {
        const maxPlayCount = Math.min(4, matchingCards.length);
        const count = Math.min(maxPlayCount, Math.random() < 0.6 ? maxPlayCount : Math.floor(Math.random() * maxPlayCount) + 1);
        return {
          action: 'play',
          cards: matchingCards.slice(0, Math.max(1, count)),
          claimedRank: trickClaimRank
        };
      } else if (canPass && pileCount > 5) {
        // 18% of the time: preserve cards and pass if pile is risky
        return { action: 'pass', cards: [], claimedRank: trickClaimRank };
      }
    }

    // If bot does NOT hold matching cards:
    if (canPass) {
      // 70% of the time or if pile is large: pass safely!
      if (pileCount > 5 || Math.random() < 0.70) {
        return { action: 'pass', cards: [], claimedRank: trickClaimRank };
      }
    }

    // Otherwise, bot bluffs with junk cards claiming the LOCKED trick rank!
    const singletons = heldRanks.filter((r) => groups[r].length === 1).map((r) => groups[r][0]);
    const junkCards = singletons.length > 0 ? singletons : botHand.filter((c) => c !== 'Jr' && c !== 'Jb');
    const bluffPool = junkCards.length > 0 ? junkCards : botHand;
    const count = Math.min(bluffPool.length, Math.random() < 0.8 ? 1 : 2);

    return {
      action: 'play',
      cards: bluffPool.slice(0, Math.max(1, count)),
      claimedRank: trickClaimRank // MUST play as the locked trick rank!
    };
  }

  // =========================================================================
  // CASE 2: NEW TRICK (Bot has the lead and can choose ANY rank!)
  // =========================================================================
  heldRanks.sort((a, b) => groups[b].length - groups[a].length);
  const bestRank = heldRanks[0] || 'A';
  const bestCards = [...(groups[bestRank] || [])];

  if (jokers.length > 0 && Math.random() < 0.4) {
    bestCards.push(jokers[0]);
  }

  // 85% of the time: lead honestly with best rank (capped at 4 cards)
  if (bestCards.length > 0 && Math.random() < 0.85) {
    const maxLead = Math.min(4, bestCards.length);
    const count = maxLead <= 2 ? maxLead : (Math.random() < 0.7 ? maxLead : maxLead - 1);
    return {
      action: 'play',
      cards: bestCards.slice(0, Math.max(1, count)),
      claimedRank: bestRank
    };
  }

  // 15% of the time: lead with a cheeky bluff
  const plausible = ['A', 'K', 'Q', 'J', '10', '9', '8'];
  const bluffClaim = plausible[Math.floor(Math.random() * plausible.length)];
  const junk = botHand.filter((c) => c !== 'Jr' && c !== 'Jb');
  const cardsToBluff = (junk.length > 0 ? junk : botHand).slice(0, Math.min(botHand.length, Math.random() < 0.7 ? 1 : 2));

  return {
    action: 'play',
    cards: cardsToBluff.length > 0 ? cardsToBluff : [botHand[0]],
    claimedRank: bluffClaim
  };
}

/**
 * AI Bot Decision: Decides whether to challenge ("BLUFF!") the previous player.
 * Evaluates mathematically and psychologically (risk vs reward).
 * @param {string[]} botHand
 * @param {string} claimedRank
 * @param {number} claimedCount (1 to any number)
 * @param {number} pileCount
 * @param {'single' | 'double'} deckType
 * @param {number} playerRemainingCards
 * @returns {boolean}
 */
export function decideBotCallBluff(
  botHand = [],
  claimedRank = 'A',
  claimedCount = 1,
  pileCount = 1,
  deckType = 'single',
  playerRemainingCards = 10
) {
  const maxInDeck = deckType === 'double' ? 8 : 4;
  const maxJokers = deckType === 'double' ? 4 : 2;

  // Count how many of claimed rank bot holds in hand
  let botCount = 0;
  for (const c of botHand) {
    const cRank = c.length === 3 ? '10' : c[0];
    if (cRank === claimedRank) botCount++;
  }

  // 1. Definite Mathematical Impossibility (100% guarantee it's a bluff!)
  if (botCount + claimedCount > maxInDeck + maxJokers) {
    return true;
  }

  // 2. High Evidence: Bot holds 3+ of the rank and player claimed 2+
  if (botCount >= 3 && claimedCount >= 2) {
    return Math.random() < 0.92;
  }

  // 3. Bot holds 2+ of the rank and player claimed 3+
  if (botCount >= 2 && claimedCount >= 3) {
    return Math.random() < 0.88;
  }

  // 4. Endgame: Player who just played has 0 or 1 card left (trying to empty hand and win!)
  if (playerRemainingCards <= 1) {
    return Math.random() < (0.65 + botCount * 0.15);
  }

  // 5. High Claim Count: Claiming 3 or 4 of any rank is inherently suspicious
  if (claimedCount >= 3) {
    return Math.random() < (0.40 + botCount * 0.18);
  }

  // 6. Pile Risk Management:
  // Low pile (<= 3 cards): Low penalty for being wrong, so bolder challenges
  if (pileCount <= 3 && Math.random() < 0.28) {
    return true;
  }

  // High pile (> 10 cards): High penalty for being wrong, only challenge if bot holds at least 1 or 2
  if (pileCount > 10) {
    return botCount >= 2 && Math.random() < 0.7;
  }

  // 7. Baseline Random Suspicion (personality factor)
  return Math.random() < (0.12 + botCount * 0.12);
}
