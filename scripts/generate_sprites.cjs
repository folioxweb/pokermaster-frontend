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

// Traditional 2-Color Card Deck:
// Spades & Clubs = Crisp Deep Black
// Hearts & Diamonds = Rich Casino Red
const suits = {
  s: { name: 'spades', symbol: '♠', color: '#111827', accent: '#374151' },
  h: { name: 'hearts', symbol: '♥', color: '#dc2626', accent: '#ef4444' },
  d: { name: 'diamonds', symbol: '♦', color: '#dc2626', accent: '#ef4444' }, // Original Red
  c: { name: 'clubs', symbol: '♣', color: '#111827', accent: '#374151' }    // Original Black
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
    const isCourt = ['J', 'Q', 'K'].includes(rank);
    const isAce = rank === 'A';

    let centerArt = '';
    if (isAce) {
      centerArt = `
        <text x="50" y="78" font-size="34" text-anchor="middle" fill="${suitData.color}" font-family="system-ui, -apple-system, sans-serif">${suitData.symbol}</text>
      `;
    } else if (isCourt) {
      centerArt = `
        <rect x="26" y="42" width="48" height="56" rx="4" fill="${suitData.accent}" opacity="0.12" stroke="${suitData.color}" stroke-width="0.8" />
        <circle cx="50" cy="62" r="14" fill="${suitData.accent}" opacity="0.25" />
        <text x="50" y="68" font-size="20" font-weight="900" text-anchor="middle" fill="${suitData.color}" font-family="Outfit, Inter, system-ui, sans-serif">${rank}</text>
        <text x="50" y="88" font-size="14" text-anchor="middle" fill="${suitData.color}">${suitData.symbol}</text>
      `;
    } else {
      centerArt = `
        <text x="50" y="74" font-size="28" text-anchor="middle" fill="${suitData.color}" font-family="system-ui, -apple-system, sans-serif">${suitData.symbol}</text>
      `;
    }

    const cardGroup = `
    <!-- Card ${rank}${suitKey} -->
    <g id="${suitKey}_${rank}">
      <rect width="100" height="140" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
      <!-- Top Left Rank & Pip -->
      <text x="10" y="22" font-size="16" font-weight="800" fill="${suitData.color}" font-family="Outfit, Inter, system-ui, sans-serif">${displayRank}</text>
      <text x="10" y="36" font-size="13" fill="${suitData.color}">${suitData.symbol}</text>
      
      <!-- Center Art -->
      ${centerArt}

      <!-- Bottom Right Rank & Pip (Rotated) -->
      <g transform="rotate(180 50 70)">
        <text x="10" y="22" font-size="16" font-weight="800" fill="${suitData.color}" font-family="Outfit, Inter, system-ui, sans-serif">${displayRank}</text>
        <text x="10" y="36" font-size="13" fill="${suitData.color}">${suitData.symbol}</text>
      </g>
    </g>
    <g id="${rank}_${suitKey}">
      <use href="#${suitKey}_${rank}" />
    </g>
    `;
    svgContent += cardGroup;
  }
}

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
