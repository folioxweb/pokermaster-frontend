import React from 'react';

const DENOMINATIONS = [
  { val: 5000, id: 'chip-5000' },
  { val: 1000, id: 'chip-1000' },
  { val: 500, id: 'chip-500' },
  { val: 100, id: 'chip-100' },
  { val: 25, id: 'chip-25' },
  { val: 5, id: 'chip-5' },
  { val: 1, id: 'chip-1' }
];

export const ChipStack = ({ amount = 0, className = '', showLabel = true }) => {
  if (amount <= 0) return null;

  // Compute chip breakdown (capped at 5 chips total for visual rendering)
  let remaining = amount;
  const chipList = [];

  for (const denom of DENOMINATIONS) {
    while (remaining >= denom.val && chipList.length < 5) {
      chipList.push(denom.id);
      remaining -= denom.val;
    }
  }

  if (chipList.length === 0) {
    chipList.push('chip-1');
  }

  return (
    <div className={`chip-stack-container inline-flex flex-col items-center select-none ${className}`}>
      <div className="relative w-8 h-8 flex items-center justify-center">
        {chipList.map((chipId, index) => (
          <svg
            key={index}
            className="absolute w-7 h-7 drop-shadow-sm transition-transform"
            style={{
              bottom: `${index * 3}px`,
              left: '2px',
              zIndex: index + 1
            }}
            viewBox="0 0 50 50"
          >
            <use href={`/assets/chips/chips-sprite.svg#${chipId}`} />
          </svg>
        ))}
      </div>
      {showLabel && (
        <span className="chip-label px-1.5 py-0.5 rounded-full text-[11px] font-bold text-amber-300 bg-slate-900/90 border border-amber-500/40 shadow-sm mt-0.5">
          ${amount.toLocaleString()}
        </span>
      )}
    </div>
  );
};
