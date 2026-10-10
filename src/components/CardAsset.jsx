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

  if (card && card.length >= 2) {
    r = card[0];
    s = card[1].toLowerCase();
  }

  const sizeClass = isCommunity ? 'card-community' : (isHero ? 'card-hero' : 'card-hole');
  const highlightClass = highlight ? 'card-highlight' : '';

  if (hidden || (!r && !s)) {
    return (
      <div className={`card-wrapper ${sizeClass} ${highlightClass} ${className}`} style={style}>
        <svg className="card-svg" viewBox="0 0 100 140">
          <use href="/assets/cards/cards-deck.svg#back-classic" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`card-wrapper ${sizeClass} ${highlightClass} ${className}`} style={style}>
      <svg className="card-svg" viewBox="0 0 100 140">
        <use href={`/assets/cards/cards-deck.svg#${s}_${r}`} />
      </svg>
    </div>
  );
};
