/**
 * ==============================================================================
 * POKER ZERO-KNOWLEDGE SECURITY SUITE
 * ==============================================================================
 * 
 * Protects hole cards and the remaining deck from being inspected via browser
 * developer tools (DevTools -> Network, Console, React State, DOM).
 *
 * Mechanics:
 * 1. Asymmetric End-to-End Cryptography (RSA-OAEP 2048-bit with SHA-256):
 *    - Each player generates a private/public keypair in local browser memory.
 *    - Private keys NEVER leave browser memory.
 *    - Hole cards dealt to a player are cryptographically sealed with their public key.
 *    - Opponents cannot decrypt them even if they intercept WebSocket network frames.
 *
 * 2. Strict Payload Sanitization:
 *    - All broadcast messages (TABLE_STATE_SYNC, SYNC_RESPONSE) strip opponents'
 *      hole cards to empty arrays `[]` during active play (preflop, flop, turn, river).
 *    - The remaining undealt deck is NEVER broadcast over the network (`deck: []`).
 *
 * 3. Memory & DOM Isolation:
 *    - On the client, opponent cards in React state and props are strictly `[]`.
 *    - Hole cards are ONLY revealed at showdown for contenders who reached showdown.
 *    - Folded cards remain masked forever.
 */

// Generate RSA-OAEP 2048-bit keypair for the player seat
export async function generateSeatKeyPair() {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return null;
  }

  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    const exportedPub = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicKeyBase64 = arrayBufferToBase64(exportedPub);

    return {
      keyPair,
      publicKey: publicKeyBase64
    };
  } catch (err) {
    console.warn('Web Crypto RSA-OAEP initialization warning:', err);
    return null;
  }
}

// Seal (encrypt) hole cards with target player's public key
export async function sealHoleCards(cards, publicKeyBase64) {
  if (!cards || cards.length === 0 || !publicKeyBase64) {
    return null;
  }

  try {
    const pubBuffer = base64ToArrayBuffer(publicKeyBase64);
    const pubKey = await window.crypto.subtle.importKey(
      'spki',
      pubBuffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false,
      ['encrypt']
    );

    const data = new TextEncoder().encode(JSON.stringify(cards));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      pubKey,
      data
    );

    return arrayBufferToBase64(encrypted);
  } catch (err) {
    console.warn('Error sealing hole cards:', err);
    return null;
  }
}

// Unseal (decrypt) hole cards with player's private key
export async function unsealHoleCards(sealedBase64, privateKey) {
  if (!sealedBase64 || !privateKey) {
    return null;
  }

  try {
    const encBuffer = base64ToArrayBuffer(sealedBase64);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encBuffer
    );

    const jsonStr = new TextDecoder().decode(decrypted);
    const cards = JSON.parse(jsonStr);
    if (Array.isArray(cards) && cards.length >= 2) {
      return cards;
    }
    return null;
  } catch (err) {
    // Decryption will naturally fail if this payload was intended for another player
    return null;
  }
}

// Sanitize players array for network broadcast or local state
export function sanitizePlayersForBroadcast(players, mySeatIndex = null, isShowdown = false) {
  if (!Array.isArray(players)) return [];

  return players.map((p) => {
    // Only disclose cards if showdown is active AND player has shownCards = true
    if (isShowdown && p.shownCards && Array.isArray(p.cards) && p.cards.length >= 2) {
      return {
        ...p,
        sealedCards: null // Plaintext revealed at showdown
      };
    }

    // During active play, mask all hole cards
    return {
      ...p,
      cards: [], // STAMP OUT ALL HOLE CARDS FROM BROADCAST
      hasCards: Boolean((p.cards && p.cards.length >= 2) || (p.sealedCards))
    };
  });
}

// Sanitize handState for network broadcast
export function sanitizeHandStateForBroadcast(handState) {
  if (!handState) return handState;

  return {
    ...handState,
    deck: [] // NEVER BROADCAST UNDEALT CARDS
  };
}

// Helper: ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
