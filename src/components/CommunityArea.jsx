import React from 'react';
import { CardAsset } from './CardAsset';
import { formatPoints } from '../lib/formatters';

export const CommunityArea = ({
  communityCards = [],
  mainPot = 0,
  sidePots = [],
  phase = 'preflop',
  winningCards = [],
  isPotPulsing = false
}) => {
  const cardSlots = [0, 1, 2, 3, 4];

  return (
    <div className="poker-community-area">
      {/* Brand Watermark */}
      <span style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.25em', color: 'rgba(251, 191, 36, 0.25)', textTransform: 'uppercase', marginBottom: '4px' }}>
        POKERMASTER
      </span>

      {/* Total Pot Display in Points */}
      <div className={`poker-pot-display ${isPotPulsing ? 'pot-pulse' : ''}`}>
        <span className="poker-pot-title">TOTAL POT:</span>
        <span className="poker-pot-value">
          {formatPoints(mainPot)}
        </span>
      </div>

      {/* Side Pots if any */}
      {sidePots && sidePots.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          {sidePots.map((sp, idx) => (
            <span
              key={idx}
              style={{ fontSize: '9px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(120, 53, 15, 0.85)', color: '#fde68a', border: '1px solid rgba(217, 119, 6, 0.5)' }}
            >
              Side Pot {idx + 1}: {formatPoints(sp.amount)}
            </span>
          ))}
        </div>
      )}

      {/* 5 Community Cards Row (Flop, Turn, River) */}
      <div className="poker-community-cards-row">
        {cardSlots.map((index) => {
          const card = communityCards[index];
          const isWinningCard = card && winningCards.includes(card);

          if (card) {
            return (
              <CardAsset
                key={index}
                card={card}
                isCommunity={true}
                highlight={isWinningCard}
              />
            );
          }

          return (
            <div key={index} className="poker-card-slot">
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.3)' }} />
            </div>
          );
        })}
      </div>

      {/* Current Street / Phase Tag */}
      <div className="poker-phase-tag">
        {phase}
      </div>
    </div>
  );
};
