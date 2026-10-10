import React from 'react';

export const CardAsset = ({
  card = null,          // e.g. "As", "Kh", "2d"
  rank = null,
  suit = null,
  hidden = false,
  highlight = false,
  className = '',
  style = {}
}) => {
  let r = rank;
  let s = suit;

  if (card && card.length >= 2) {
    r = card[0];
    s = card[1].toLowerCase();
  }

  const highlightClass = highlight ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-500/50 scale-105' : '';

  if (hidden || (!r && !s)) {
    return (
      <div className={`card-wrapper select-none transition-transform duration-200 ${highlightClass} ${className}`} style={style}>
        <svg className="card-svg w-full h-full drop-shadow-md rounded-[7px]" viewBox="0 0 100 140">
          <use href="/assets/cards/cards-deck.svg#back-classic" />
        </svg>
      </div>
    );
  }

  return (
    <div className={`card-wrapper select-none transition-transform duration-200 ${highlightClass} ${className}`} style={style}>
      <svg className="card-svg w-full h-full drop-shadow-md rounded-[7px]" viewBox="0 0 100 140">
        <use href={`/assets/cards/cards-deck.svg#${s}_${r}`} />
      </svg>
    </div>
  );
};
