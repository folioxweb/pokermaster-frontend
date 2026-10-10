import React from 'react';
import { CardAsset } from './CardAsset';
import { ChipStack } from './ChipStack';

export const CommunityArea = ({
  communityCards = [],
  mainPot = 0,
  sidePots = [],
  phase = 'preflop',
  winningCards = []
}) => {
  // Ensure we always have 5 card slots
  const cardSlots = [0, 1, 2, 3, 4];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-10">
      {/* Table Center Watermark / Logo */}
      <div className="text-center opacity-25 mb-1">
        <span className="text-xs font-black tracking-[0.3em] uppercase text-amber-200/60 drop-shadow">
          POKERMASTER
        </span>
      </div>

      {/* Main Pot & Side Pots Display */}
      <div className="flex flex-col items-center mb-3">
        <div className="flex items-center space-x-2 px-4 py-1.5 rounded-full bg-slate-950/80 border border-amber-500/40 backdrop-blur-md shadow-2xl">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
            TOTAL POT:
          </span>
          <span className="text-base font-black text-white tracking-wide">
            ${mainPot.toLocaleString()}
          </span>
        </div>

        {/* Side Pots if any */}
        {sidePots && sidePots.length > 0 && (
          <div className="flex items-center space-x-2 mt-1">
            {sidePots.map((sp, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-600/30"
              >
                Side Pot {idx + 1}: ${sp.amount}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 5 Community Cards Display */}
      <div className="flex items-center space-x-2 p-2 rounded-2xl bg-black/25 backdrop-blur-sm border border-emerald-500/10 shadow-inner">
        {cardSlots.map((index) => {
          const card = communityCards[index];
          const isWinningCard = card && winningCards.includes(card);

          if (card) {
            return (
              <div key={index} className="transition-all duration-300 transform scale-100 animate-in fade-in">
                <CardAsset
                  card={card}
                  highlight={isWinningCard}
                  className="w-13 h-18 sm:w-14 sm:h-20 shadow-2xl"
                />
              </div>
            );
          }

          // Card outline placeholder slot
          return (
            <div
              key={index}
              className="w-13 h-18 sm:w-14 sm:h-20 rounded-[7px] border-2 border-dashed border-emerald-500/20 bg-emerald-950/15 flex items-center justify-center opacity-60"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500/20" />
            </div>
          );
        })}
      </div>

      {/* Phase Label Pill */}
      <div className="mt-2.5">
        <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-950/70 border border-emerald-500/30 shadow-md">
          {phase}
        </span>
      </div>
    </div>
  );
};
