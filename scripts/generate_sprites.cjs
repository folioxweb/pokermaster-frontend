const fs = require('fs');
const path = require('path');

const publicCardsDir = path.resolve(__dirname, '../public/assets/cards');
const publicChipsDir = path.resolve(__dirname, '../public/assets/chips');
const distCardsDir = path.resolve(__dirname, '../dist/assets/cards');
const distChipsDir = path.resolve(__dirname, '../dist/assets/chips');

fs.mkdirSync(publicCardsDir, { recursive: true });
fs.mkdirSync(publicChipsDir, { recursive: true });
if (fs.existsSync(path.resolve(__dirname, '../dist'))) {
  fs.mkdirSync(distCardsDir, { recursive: true });
  fs.mkdirSync(distChipsDir, { recursive: true });
}

// Traditional High-Contrast 2-Color Card Deck:
// Spades & Clubs = Deep Obsidian Black (#0f172a)
// Hearts & Diamonds = Rich Casino Red (#dc2626)
const suits = {
  s: {
    name: 'spades',
    symbol: '♠',
    color: '#0f172a',
    // Standard high-precision 100x100 viewBox Spade path
    path: 'M 50,10 C 50,10 16,48 16,68 C 16,80 27,88 39,88 C 45,88 48,85 50,82.5 C 47.5,91 42,96 35,100 L 65,100 C 58,96 52.5,91 50,82.5 C 52,85 55,88 61,88 C 73,88 84,80 84,68 C 84,48 50,10 50,10 Z'
  },
  h: {
    name: 'hearts',
    symbol: '♥',
    color: '#dc2626',
    // Standard high-precision 100x100 viewBox Heart path
    path: 'M 50,86 C 50,86 15,55 15,34 C 15,19 27,12 38.5,12 C 45.5,12 49,16 50,21 C 51,16 54.5,12 61.5,12 C 73,12 85,19 85,34 C 85,55 50,86 50,86 Z'
  },
  d: {
    name: 'diamonds',
    symbol: '♦',
    color: '#dc2626',
    // Sharp classic casino Diamond path
    path: 'M 50,8 L 86,50 L 50,92 L 14,50 Z'
  },
  c: {
    name: 'clubs',
    symbol: '♣',
    color: '#0f172a',
    // Standard high-precision 100x100 viewBox Club path
    path: 'M 50,12 C 39,12 31,21 31,31 C 31,37 33.5,42.5 37.5,46 C 32,44.5 25.5,46.5 21,51 C 15,57 15,67 21,73 C 27,79 37.5,79 43.5,73 C 45.5,71 47,68 47.8,65 C 46.8,76 41.5,88 34,98 L 66,98 C 58.5,88 53.2,76 52.2,65 C 53,68 54.5,71 56.5,73 C 62.5,79 73,79 79,73 C 85,67 85,57 79,51 C 74.5,46.5 68,44.5 62.5,46 C 66.5,42.5 69,37 69,31 C 69,21 61,12 50,12 Z'
  }
};

const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
  <defs>
    <!-- Card Back -->
    <g id="back-classic">
      <rect width="100" height="140" rx="8" fill="#0f172a" stroke="#d4af37" stroke-width="2.5" />
      <rect x="5" y="5" width="90" height="130" rx="6" fill="#1e293b" stroke="#94a3b8" stroke-width="0.75" stroke-dasharray="2,2" />
      <pattern id="card-lattice" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M 0 5 L 5 0 L 10 5 L 5 10 Z" fill="none" stroke="#d4af37" stroke-width="0.6" opacity="0.4" />
      </pattern>
      <rect x="8" y="8" width="84" height="124" rx="4" fill="url(#card-lattice)" />
      <circle cx="50" cy="70" r="18" fill="#0f172a" stroke="#d4af37" stroke-width="1.5" />
      <polygon points="50,58 54,66 62,70 54,74 50,82 46,74 38,70 46,66" fill="#d4af37" />
    </g>
`;

for (const [suitKey, suitData] of Object.entries(suits)) {
  for (const rank of ranks) {
    const displayRank = rank === 'T' ? '10' : rank;
    const isTen = rank === 'T';
    const rankX = isTen ? '6' : '9';

    // Big, sharp, bold center suit art for ALL cards (Numbers, Court J/Q/K, and Ace)
    // Scaled to 48x48 and perfectly centered at (50, 70)
    const centerArt = `
      <g transform="translate(26, 46) scale(0.48)">
        <path d="${suitData.path}" fill="${suitData.color}" />
      </g>
    `;

    const cardGroup = `
    <!-- Card ${rank}${suitKey} -->
    <g id="${suitKey}_${rank}">
      <rect width="100" height="140" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.6" />
      
      <!-- Top Left Big Rank & Crisp Vector Pip -->
      <text x="${rankX}" y="24" font-size="21" font-weight="900" fill="${suitData.color}" font-family="Outfit, Inter, system-ui, -apple-system, sans-serif" letter-spacing="-0.03em">${displayRank}</text>
      <g transform="translate(8, 29) scale(0.17)">
        <path d="${suitData.path}" fill="${suitData.color}" />
      </g>
      
      <!-- Center Art: Big Distinct Suit Shape -->
      ${centerArt}

      <!-- Bottom Right Big Rank & Crisp Vector Pip (Rotated 180) -->
      <g transform="rotate(180 50 70)">
        <text x="${rankX}" y="24" font-size="21" font-weight="900" fill="${suitData.color}" font-family="Outfit, Inter, system-ui, -apple-system, sans-serif" letter-spacing="-0.03em">${displayRank}</text>
        <g transform="translate(8, 29) scale(0.17)">
          <path d="${suitData.path}" fill="${suitData.color}" />
        </g>
      </g>
    </g>
    <g id="${rank}_${suitKey}">
      <use href="#${suitKey}_${rank}" />
    </g>
    `;
    svgContent += cardGroup;
  }
}

// Jokers (For Bluff / Wildcard Games)
svgContent += `
    <!-- Red Joker (Wildcard) -->
    <g id="joker_red">
      <rect width="100" height="140" rx="8" fill="#fffdfa" stroke="#cbd5e1" stroke-width="1.5" />
      <rect x="3.5" y="3.5" width="93" height="133" rx="6" fill="none" stroke="rgba(220, 38, 38, 0.35)" stroke-width="0.8" />
      <text x="9" y="16" font-size="12" font-weight="900" fill="#dc2626" font-family="Outfit, Inter, sans-serif">★</text>
      <text x="9" y="27" font-size="8.5" font-weight="900" fill="#dc2626" font-family="Outfit, Inter, sans-serif">J</text>
      <text x="9" y="36" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">O</text>
      <text x="9" y="44" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">K</text>
      <text x="9" y="52" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">E</text>
      <text x="9" y="60" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">R</text>

      <g transform="translate(50, 68)">
        <circle cx="0" cy="0" r="28" fill="rgba(254, 243, 199, 0.6)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1" />
        <circle cx="0" cy="0" r="22" fill="rgba(254, 226, 226, 0.7)" stroke="#f87171" stroke-width="0.75" />
        <path d="M-18 -2 C-24 -16 -12 -28 -20 -28 C-10 -20 -8 -8 0 -4 C8 -8 10 -20 20 -28 C12 -28 24 -16 18 -2 Z" fill="#dc2626" stroke="#991b1b" stroke-width="1.2" />
        <path d="M-8 -3 C-12 -20 0 -32 0 -32 C0 -32 12 -20 8 -3 Z" fill="#f59e0b" stroke="#b45309" stroke-width="1.2" />
        <circle cx="-20" cy="-28" r="3" fill="#fbbf24" stroke="#d97706" stroke-width="0.8" />
        <circle cx="0" cy="-32" r="3.2" fill="#fbbf24" stroke="#d97706" stroke-width="0.8" />
        <circle cx="20" cy="-28" r="3" fill="#fbbf24" stroke="#d97706" stroke-width="0.8" />
        <ellipse cx="0" cy="5" rx="14" ry="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />
        <path d="M-7 3 Q-5 0 -3 3" stroke="#dc2626" stroke-width="1.5" fill="none" stroke-linecap="round" />
        <path d="M3 3 Q5 0 7 3" stroke="#dc2626" stroke-width="1.5" fill="none" stroke-linecap="round" />
        <circle cx="-8" cy="7" r="2" fill="rgba(239, 68, 68, 0.5)" />
        <circle cx="8" cy="7" r="2" fill="rgba(239, 68, 68, 0.5)" />
        <path d="M-6 8 Q0 13 6 8" stroke="#991b1b" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <rect x="-24" y="19" width="48" height="13" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="1.2" />
        <text x="0" y="29" font-size="9" font-weight="900" text-anchor="middle" fill="#b45309" letter-spacing="1.5" font-family="Outfit, Inter, sans-serif">★ WILD ★</text>
      </g>

      <g transform="rotate(180 50 70)">
        <text x="9" y="16" font-size="12" font-weight="900" fill="#dc2626" font-family="Outfit, Inter, sans-serif">★</text>
        <text x="9" y="27" font-size="8.5" font-weight="900" fill="#dc2626" font-family="Outfit, Inter, sans-serif">J</text>
        <text x="9" y="36" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">O</text>
        <text x="9" y="44" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">K</text>
        <text x="9" y="52" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">E</text>
        <text x="9" y="60" font-size="7.5" font-weight="800" fill="#dc2626" font-family="Outfit, Inter, sans-serif">R</text>
      </g>
    </g>
    <g id="Jr"><use href="#joker_red" /></g>
    <g id="r_J"><use href="#joker_red" /></g>

    <!-- Black Joker (Wildcard) -->
    <g id="joker_black">
      <rect width="100" height="140" rx="8" fill="#fffdfa" stroke="#cbd5e1" stroke-width="1.5" />
      <rect x="3.5" y="3.5" width="93" height="133" rx="6" fill="none" stroke="rgba(15, 23, 42, 0.4)" stroke-width="0.8" />
      <text x="9" y="16" font-size="12" font-weight="900" fill="#0f172a" font-family="Outfit, Inter, sans-serif">★</text>
      <text x="9" y="27" font-size="8.5" font-weight="900" fill="#0f172a" font-family="Outfit, Inter, sans-serif">J</text>
      <text x="9" y="36" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">O</text>
      <text x="9" y="44" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">K</text>
      <text x="9" y="52" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">E</text>
      <text x="9" y="60" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">R</text>

      <g transform="translate(50, 68)">
        <circle cx="0" cy="0" r="28" fill="rgba(241, 245, 249, 0.7)" stroke="rgba(100, 116, 139, 0.4)" stroke-width="1" />
        <circle cx="0" cy="0" r="22" fill="rgba(224, 231, 255, 0.7)" stroke="#818cf8" stroke-width="0.75" />
        <path d="M-18 -2 C-24 -16 -12 -28 -20 -28 C-10 -20 -8 -8 0 -4 C8 -8 10 -20 20 -28 C12 -28 24 -16 18 -2 Z" fill="#0f172a" stroke="#020617" stroke-width="1.2" />
        <path d="M-8 -3 C-12 -20 0 -32 0 -32 C0 -32 12 -20 8 -3 Z" fill="#4338ca" stroke="#312e81" stroke-width="1.2" />
        <circle cx="-20" cy="-28" r="3" fill="#cbd5e1" stroke="#64748b" stroke-width="0.8" />
        <circle cx="0" cy="-32" r="3.2" fill="#cbd5e1" stroke="#64748b" stroke-width="0.8" />
        <circle cx="20" cy="-28" r="3" fill="#cbd5e1" stroke="#64748b" stroke-width="0.8" />
        <ellipse cx="0" cy="5" rx="14" ry="10" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />
        <path d="M-7 3 Q-5 0 -3 3" stroke="#4338ca" stroke-width="1.5" fill="none" stroke-linecap="round" />
        <path d="M3 3 Q5 0 7 3" stroke="#4338ca" stroke-width="1.5" fill="none" stroke-linecap="round" />
        <circle cx="-8" cy="7" r="2" fill="rgba(148, 163, 184, 0.4)" />
        <circle cx="8" cy="7" r="2" fill="rgba(148, 163, 184, 0.4)" />
        <path d="M-6 8 Q0 13 6 8" stroke="#0f172a" stroke-width="1.6" fill="none" stroke-linecap="round" />
        <rect x="-24" y="19" width="48" height="13" rx="4" fill="#e0e7ff" stroke="#6366f1" stroke-width="1.2" />
        <text x="0" y="29" font-size="9" font-weight="900" text-anchor="middle" fill="#312e81" letter-spacing="1.5" font-family="Outfit, Inter, sans-serif">★ WILD ★</text>
      </g>

      <g transform="rotate(180 50 70)">
        <text x="9" y="16" font-size="12" font-weight="900" fill="#0f172a" font-family="Outfit, Inter, sans-serif">★</text>
        <text x="9" y="27" font-size="8.5" font-weight="900" fill="#0f172a" font-family="Outfit, Inter, sans-serif">J</text>
        <text x="9" y="36" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">O</text>
        <text x="9" y="44" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">K</text>
        <text x="9" y="52" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">E</text>
        <text x="9" y="60" font-size="7.5" font-weight="800" fill="#0f172a" font-family="Outfit, Inter, sans-serif">R</text>
      </g>
    </g>
    <g id="Jb"><use href="#joker_black" /></g>
    <g id="b_J"><use href="#joker_black" /></g>
  `;

  svgContent += `\n  </defs>\n</svg>`;

// Write cards sprite to public and dist
fs.writeFileSync(path.join(publicCardsDir, 'cards-deck.svg'), svgContent, 'utf8');
if (fs.existsSync(distCardsDir)) {
  fs.writeFileSync(path.join(distCardsDir, 'cards-deck.svg'), svgContent, 'utf8');
}

// Generate Chips Sprite
const chipDenoms = [
  { val: 1, label: '1', bg: '#ffffff', text: '#0f172a', edge: '#3b82f6' },
  { val: 5, label: '5', bg: '#ef4444', text: '#ffffff', edge: '#ffffff' },
  { val: 25, label: '25', bg: '#10b981', text: '#ffffff', edge: '#ffffff' },
  { val: 100, label: '100', bg: '#1e293b', text: '#ffffff', edge: '#f59e0b' },
  { val: 500, label: '500', bg: '#8b5cf6', text: '#ffffff', edge: '#ec4899' },
  { val: 1000, label: '1K', bg: '#f59e0b', text: '#000000', edge: '#ffffff' },
  { val: 5000, label: '5K', bg: '#ec4899', text: '#ffffff', edge: '#fbbf24' }
];

let chipsSvg = `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">
  <defs>
`;

for (const c of chipDenoms) {
  chipsSvg += `
    <g id="chip-${c.val}">
      <!-- Outer rim with dash inlays -->
      <circle cx="25" cy="25" r="24" fill="${c.bg}" stroke="#000000" stroke-width="0.8" />
      <circle cx="25" cy="25" r="22" fill="none" stroke="${c.edge}" stroke-width="3" stroke-dasharray="6,4" />
      <circle cx="25" cy="25" r="16" fill="#0f172a" stroke="#d4af37" stroke-width="1.2" />
      <circle cx="25" cy="25" r="14" fill="${c.bg}" />
      <text x="25" y="29" font-size="10" font-weight="900" text-anchor="middle" fill="${c.text}" font-family="Outfit, Inter, sans-serif">${c.label}</text>
    </g>
  `;
}

chipsSvg += `
    <!-- Dealer Button -->
    <g id="badge-dealer">
      <circle cx="20" cy="20" r="19" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
      <circle cx="20" cy="20" r="15" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
      <text x="20" y="26" font-size="16" font-weight="900" text-anchor="middle" fill="#0f172a" font-family="Outfit, sans-serif">D</text>
    </g>
    <!-- Small Blind Badge -->
    <g id="badge-sb">
      <circle cx="20" cy="20" r="19" fill="#3b82f6" stroke="#93c5fd" stroke-width="2" />
      <text x="20" y="25" font-size="12" font-weight="900" text-anchor="middle" fill="#ffffff" font-family="Outfit, sans-serif">SB</text>
    </g>
    <!-- Big Blind Badge -->
    <g id="badge-bb">
      <circle cx="20" cy="20" r="19" fill="#e11d48" stroke="#fda4af" stroke-width="2" />
      <text x="20" y="25" font-size="12" font-weight="900" text-anchor="middle" fill="#ffffff" font-family="Outfit, sans-serif">BB</text>
    </g>
    <!-- All-In Badge -->
    <g id="badge-allin">
      <polygon points="20,2 38,36 2,36" fill="#ef4444" stroke="#fbbf24" stroke-width="2" />
      <text x="20" y="28" font-size="8" font-weight="900" text-anchor="middle" fill="#ffffff" font-family="Outfit, sans-serif">ALL IN</text>
    </g>
  </defs>
</svg>
`;

fs.writeFileSync(path.join(publicChipsDir, 'chips-sprite.svg'), chipsSvg, 'utf8');
if (fs.existsSync(distChipsDir)) {
  fs.writeFileSync(path.join(distChipsDir, 'chips-sprite.svg'), chipsSvg, 'utf8');
}
console.log('Successfully generated classic black & red cards and chips sprites');
