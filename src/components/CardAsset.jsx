import React from 'react';

export const CardAsset = ({
  card = null,          // e.g. "As", "Kh", "2d"
  rank = null,
  suit = null,
  hidden = false,
  highlight = false,
  isCommunity = false,  // true for 5 community cards, false for hole cards
  isHero = false,       // true for player's own cards
  className = '',
  style = {}
}) => {
  let r = rank;
  let s = suit;

  // Check for Joker (e.g. "Jr" for Red Joker, "Jb" for Black Joker, or rank="Joker")
  const isJoker = card === 'Jr' || card === 'Jb' || card === 'JOKER' || rank === 'Joker' || rank === 'JOKER';

  if (card && card.length >= 2 && !isJoker) {
    if (card.length === 3) {
      r = card.slice(0, 2);
      s = card[2].toLowerCase();
    } else {
      r = card[0];
      s = card[1].toLowerCase();
    }
  }

  const svgRank = r === '10' ? 'T' : r;

  const sizeClass = isCommunity ? 'card-community' : (isHero ? 'card-hero' : 'card-hole');
  const highlightClass = highlight ? 'card-highlight' : '';

  if (hidden || (!isJoker && !r && !s)) {
    return (
      <div className={`card-wrapper ${sizeClass} ${highlightClass} ${className}`} style={style}>
        <svg className="card-svg" viewBox="0 0 100 140">
          <use href="/assets/cards/cards-deck.svg#back-classic" />
        </svg>
      </div>
    );
  }

  if (isJoker) {
    const jokerSvgId = (card === 'Jb' || s === 'b' || s === 'black') ? 'joker_black' : 'joker_red';
    return (
      <div className={`card-wrapper ${sizeClass} ${highlightClass} ${className}`} style={style}>
        <svg className="card-svg" viewBox="0 0 100 140">
          <use href={`/assets/cards/cards-deck.svg#${jokerSvgId}`} />
        </svg>
      </div>
    );
  }

  return (
    <div className={`card-wrapper ${sizeClass} ${highlightClass} ${className}`} style={style}>
      <svg className="card-svg" viewBox="0 0 100 140">
        <use href={`/assets/cards/cards-deck.svg#${s}_${svgRank}`} />
      </svg>
    </div>
  );
};
