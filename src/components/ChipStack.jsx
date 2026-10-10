import React from 'react';
import { formatPoints } from '../lib/formatters';

/**
 * Exact Chip Specifications matching casino standard & prompt image:
 * 1  = White with Blue stripes
 * 2  = Blue with White stripes
 * 5  = Red with White stripes
 * 10 = Green with White stripes
 * 20 = Black with White stripes
 */
export const CHIP_CONFIGS = {
  1: {
    value: 1,
    baseColor: '#f8fafc',
    stripeColor: '#2563eb',
    textColor: '#0f172a',
    borderColor: '#94a3b8',
    glow: 'rgba(255, 255, 255, 0.4)'
  },
  2: {
    value: 2,
    baseColor: '#2563eb',
    stripeColor: '#f8fafc',
    textColor: '#ffffff',
    borderColor: '#1d4ed8',
    glow: 'rgba(37, 99, 235, 0.4)'
  },
  5: {
    value: 5,
    baseColor: '#dc2626',
    stripeColor: '#f8fafc',
    textColor: '#ffffff',
    borderColor: '#b91c1c',
    glow: 'rgba(220, 38, 38, 0.4)'
  },
  10: {
    value: 10,
    baseColor: '#16a34a',
    stripeColor: '#f8fafc',
    textColor: '#ffffff',
    borderColor: '#15803d',
    glow: 'rgba(22, 163, 74, 0.4)'
  },
  20: {
    value: 20,
    baseColor: '#18181b',
    stripeColor: '#f8fafc',
    textColor: '#ffffff',
    borderColor: '#3f3f46',
    glow: 'rgba(24, 24, 27, 0.6)'
  }
};

/**
 * Authentic SVG Casino Poker Chip
 * Renders 8 perimeter edge inserts, radial grooved ring, and denomination.
 */
export const PokerChipSVG = ({ value = 1, size = 26, className = '' }) => {
  const config = CHIP_CONFIGS[value] || CHIP_CONFIGS[1];
  const center = 20;
  const radius = 18;
  const innerRadius = 11;
  const stripeAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={`poker-chip-svg ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.65))',
        flexShrink: 0
      }}
    >
      {/* Outer Chip Base Circle */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill={config.baseColor}
        stroke={config.borderColor}
        strokeWidth="1.2"
      />

      {/* 8 Perimeter Edge Stripes / Inserts */}
      {stripeAngles.map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = center + (radius - 5.5) * Math.cos(rad);
        const y1 = center + (radius - 5.5) * Math.sin(rad);
        const x2 = center + radius * Math.cos(rad);
        const y2 = center + radius * Math.sin(rad);

        return (
          <line
            key={angle}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={config.stripeColor}
            strokeWidth="3.2"
            strokeLinecap="butt"
          />
        );
      })}

      {/* Outer Bevel / Edge Rim */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="0.8"
      />

      {/* Inner Concentric Clay Groove (Dashed line ring) */}
      <circle
        cx={center}
        cy={center}
        r={innerRadius + 2.2}
        fill="none"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.9"
        strokeDasharray="2, 1.5"
      />

      {/* Center Circular Inlay */}
      <circle
        cx={center}
        cy={center}
        r={innerRadius}
        fill={config.baseColor}
        stroke="rgba(0,0,0,0.3)"
        strokeWidth="1"
      />

      {/* Denomination Value */}
      <text
        x={center}
        y={center + 4}
        textAnchor="middle"
        fill={config.textColor}
        fontSize="10"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {config.value}
      </text>
    </svg>
  );
};

/**
 * Break down any bet/pot amount into optimal poker chips (20, 10, 5, 2, 1)
 */
export function getChipBreakdown(amount = 0, maxChips = 4) {
  let remaining = Math.max(0, Math.round(amount));
  const chips = [];
  const denoms = [20, 10, 5, 2, 1];

  for (const d of denoms) {
    while (remaining >= d && chips.length < maxChips) {
      chips.push(d);
      remaining -= d;
    }
  }

  // If amount still remains, add at least one largest chip
  if (chips.length === 0 && amount > 0) {
    chips.push(20);
  }

  return chips;
}

/**
 * Multi-colored Chip Badge with stacking chips and Points label
 */
export const ChipBadge = ({ amount = 0, className = '' }) => {
  if (amount <= 0) return null;

  const chips = getChipBreakdown(amount, 3);
  const primaryChip = chips[0] || 20;
  const config = CHIP_CONFIGS[primaryChip] || CHIP_CONFIGS[20];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border shadow-md ${className}`}
      style={{
        background: 'rgba(11, 15, 25, 0.94)',
        borderColor: config.borderColor,
        boxShadow: `0 4px 12px rgba(0,0,0,0.6)`
      }}
    >
      {/* Overlapping Staged Chips */}
      <div style={{ display: 'flex', alignItems: 'center', marginLeft: '-2px' }}>
        {chips.map((chipVal, idx) => (
          <div
            key={idx}
            style={{
              marginLeft: idx === 0 ? '0px' : '-10px',
              zIndex: idx + 1
            }}
          >
            <PokerChipSVG value={chipVal} size={20} />
          </div>
        ))}
      </div>

      {/* Total Amount in Points (Strictly No Dollar Sign) */}
      <span style={{ fontSize: '11px', fontWeight: 900, color: '#fbbf24', letterSpacing: '0.02em' }}>
        {formatPoints(amount)}
      </span>
    </div>
  );
};

export const ChipStack = ({ amount = 0, className = '' }) => {
  return <ChipBadge amount={amount} className={className} />;
};
