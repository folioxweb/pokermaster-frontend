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
 * AI Bot Decision: Decides which cards to play on its turn.
 * @param {string[]} botHand
 * @param {string} claimedRank
 * @param {boolean} canPass
 * @returns {{ action: 'play' | 'pass', cards: string[] }}
 */
export function decideBotPlay(botHand = [], claimedRank = 'A', canPass = false) {
  // 1. Check for real matching cards & jokers in hand
  const matchingCards = [];
  const jokers = [];
  const otherCards = [];

  for (const c of botHand) {
    const isJoker = c === 'Jr' || c === 'Jb';
    const cRank = c.length === 3 ? '10' : c[0];
    if (isJoker) jokers.push(c);
    else if (cRank === claimedRank) matchingCards.push(c);
    else otherCards.push(c);
  }

  // 2. If bot has real matching cards, 85% probability it tells the truth
  if (matchingCards.length > 0 && Math.random() < 0.85) {
    // Play up to 3 or 4 matching cards
    const playCount = Math.min(matchingCards.length, Math.floor(Math.random() * 2) + 1);
    return {
      action: 'play',
      cards: matchingCards.slice(0, playCount)
    };
  }

  // 3. If bot has a Joker and no real matches, 50% chance it uses Joker as wild
  if (jokers.length > 0 && Math.random() < 0.5) {
    return {
      action: 'play',
      cards: [jokers[0]]
    };
  }

  // 4. If canPass and bot has high hand count and hates risk, pass 40% of time
  if (canPass && botHand.length > 6 && Math.random() < 0.4) {
    return {
      action: 'pass',
      cards: []
    };
  }

  // 5. Otherwise: BLUFF! Pick 1 to 2 random non-matching cards (lowest value)
  const bluffCount = Math.min(otherCards.length, Math.random() < 0.75 ? 1 : 2);
  const cardsToBluff = otherCards.slice(0, Math.max(1, bluffCount));

  return {
    action: 'play',
    cards: cardsToBluff
  };
}

/**
 * AI Bot Decision: Decides whether to challenge ("BLUFF!") the previous player.
 * @param {string[]} botHand
 * @param {string} claimedRank
 * @param {number} claimedCount (1 to 4)
 * @param {number} pileCount
 * @param {'single' | 'double'} deckType
 * @returns {boolean}
 */
export function decideBotCallBluff(botHand = [], claimedRank = 'A', claimedCount = 1, pileCount = 1, deckType = 'single') {
  const maxInDeck = deckType === 'double' ? 8 : 4;
  const maxJokers = deckType === 'double' ? 4 : 2;

  // Count how many of claimed rank bot holds in hand
  let botCount = 0;
  for (const c of botHand) {
    const cRank = c.length === 3 ? '10' : c[0];
    if (cRank === claimedRank) botCount++;
  }

  // Impossible scenario: Bot + Claim exceeds max possible cards + jokers in deck
  if (botCount + claimedCount > maxInDeck + maxJokers) {
    return true; // 100% guarantee it's a bluff!
  }

  // High probability of bluff if bot holds 3 or 4 of that rank and player claimed 2 or 3
  if (botCount >= 3 && claimedCount >= 2) {
    return Math.random() < 0.9;
  }

  // If someone claimed 3 or 4 cards of a rank, suspicion is high
  if (claimedCount >= 3) {
    return Math.random() < (0.45 + (botCount * 0.15));
  }

  // If pile is very small (1-3 cards), bot has low risk to challenge
  if (pileCount <= 3 && Math.random() < 0.25) {
    return true;
  }

  // Default modest suspicion
  return Math.random() < (0.12 + (botCount * 0.1));
}
