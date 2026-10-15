import React, { useState, useEffect } from 'react';
import { playChipClink } from '../lib/soundEffects';
import { formatPoints, formatPointsOnly } from '../lib/formatters';
import { Coins, Plus, Minus } from 'lucide-react';

export const PlayerHUD = ({
  isMyTurn = false,
  heroPlayer = null,
  currentTurnPlayerName = '',
  currentBet = 0,
  minRaise = 4,
  bigBlind = 4,
  mainPot = 0,
  onAction = null  // (action, amount) => void
}) => {
  if (!heroPlayer || heroPlayer.status === 'folded' || heroPlayer.status === 'sitting_out') {
    return null;
  }

  const callAmount = Math.max(0, currentBet - (heroPlayer.current_round_bet || 0));
  const canCheck = callAmount === 0;
  const maxBet = heroPlayer.chips + (heroPlayer.current_round_bet || 0);
  const minBetAllowed = Math.min(maxBet, currentBet + minRaise);

  const [betAmount, setBetAmount] = useState(minBetAllowed);

  useEffect(() => {
    setBetAmount(minBetAllowed);
  }, [minBetAllowed]);

  const handleSliderChange = (e) => {
    const val = Math.max(minBetAllowed, Math.min(maxBet, Number(e.target.value)));
    setBetAmount(val);
    playChipClink();
  };

  const handleStepAdjust = (delta) => {
    const nextVal = Math.max(minBetAllowed, Math.min(maxBet, betAmount + delta));
    setBetAmount(nextVal);
    playChipClink();
  };

  // Base calculation for multiplier presets
  const calcPresetAmount = (multiplier) => {
    const base = Math.max(currentBet, bigBlind || 20);
    const target = Math.round(base * multiplier);
    return Math.min(maxBet, Math.max(minBetAllowed, target));
  };

  // 1. Remove duplicate Min vs Raise 2x:
  // Candidates: 2.5x, 3x, 4x, 8x
  // Filter out any that equal minBetAllowed (which removes duplicate Min) or equal maxBet (covered by All-In)
  const candidateMultipliers = [2.5, 3, 4, 8];
  const uniquePresets = [];
  for (const m of candidateMultipliers) {
    const amt = calcPresetAmount(m);
    if (amt > minBetAllowed && amt < maxBet && !uniquePresets.some((p) => p.amt === amt)) {
      uniquePresets.push({
        m,
        amt,
        label: currentBet > 0 ? `Raise ${m}x` : `Bet ${m}x`
      });
    }
  }

  const applyPresetAmount = (amt) => {
    setBetAmount(Math.min(maxBet, Math.max(minBetAllowed, amt)));
    playChipClink();
  };

  const stepSize = Math.max(1, Math.round((bigBlind || 20) / 2));

  return (
    <div className="poker-hud-wrapper">
      {/* Main Action HUD Panel */}
      <div className={`poker-hud-panel ${isMyTurn ? 'active' : ''}`}>
        {/* Hero Identity Bar (No timer, No hand suggestion - timer is now on Information Board) */}
        <div className="poker-hud-hero-bar">
          <div className="poker-hud-hero-left">
            <div className="poker-hud-avatar">
              {heroPlayer.username ? heroPlayer.username.slice(0, 2).toUpperCase() : 'ME'}
            </div>
            <div className="poker-hud-info">
              <span className="poker-hud-username">
                {heroPlayer.username} <span className="poker-hud-you-tag">YOU</span>
              </span>
              <span className="poker-hud-points">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>{formatPoints(heroPlayer.chips || 0)}</span>
              </span>
            </div>
          </div>

          {!isMyTurn && (
            <div className="poker-hud-waiting-badge">
              <span>Waiting for {currentTurnPlayerName || 'turn'}...</span>
            </div>
          )}
        </div>

        {isMyTurn ? (
          <div>
            {/* Quick Raise Presets Bar & Slider */}
            {heroPlayer.chips > callAmount && (
              <div>
                <div className="poker-presets-bar">
                  {/* Min Option (Always minimum allowed) */}
                  <button
                    type="button"
                    onClick={() => applyPresetAmount(minBetAllowed)}
                    className={`poker-preset-btn ${betAmount === minBetAllowed ? 'active' : ''}`}
                    title="Minimum allowed raise"
                  >
                    <span className="poker-preset-title">Min</span>
                    <span className="poker-preset-amount">{formatPointsOnly(minBetAllowed)}</span>
                  </button>

                  {/* Multipliers that are strictly above Min and below All-In */}
                  {uniquePresets.map((p) => (
                    <button
                      key={p.m}
                      type="button"
                      onClick={() => applyPresetAmount(p.amt)}
                      className={`poker-preset-btn ${betAmount === p.amt ? 'active' : ''}`}
                    >
                      <span className="poker-preset-title">{p.label}</span>
                      <span className="poker-preset-amount">{formatPointsOnly(p.amt)}</span>
                    </button>
                  ))}

                  {/* All-In Option (Only if above Min) */}
                  {maxBet > minBetAllowed && (
                    <button
                      type="button"
                      onClick={() => applyPresetAmount(maxBet)}
                      className={`poker-preset-btn all-in ${betAmount === maxBet ? 'active' : ''}`}
                    >
                      <span className="poker-preset-title">All-In</span>
                      <span className="poker-preset-amount">{formatPointsOnly(maxBet)}</span>
                    </button>
                  )}
                </div>

                {/* Granular Slider: Select ANY amount above minimum */}
                <div className="poker-slider-row">
                  <button
                    type="button"
                    onClick={() => handleStepAdjust(-stepSize)}
                    className="poker-slider-step-btn"
                    disabled={betAmount <= minBetAllowed}
                    title={`Decrease by ${stepSize} PTS`}
                  >
                    <Minus className="w-3 h-3" />
                  </button>

                  <div className="poker-slider-track-wrap">
                    <div className="poker-slider-labels">
                      <span className="poker-slider-bound">Min: {formatPointsOnly(minBetAllowed)}</span>
                      <span className="poker-slider-val-tag">
                        {currentBet === 0 ? 'Bet:' : 'Raise To:'} <strong>{formatPoints(betAmount)}</strong>
                      </span>
                      <span className="poker-slider-bound">Max: {formatPointsOnly(maxBet)}</span>
                    </div>

                    <input
                      type="range"
                      min={minBetAllowed}
                      max={maxBet}
                      step={1}
                      value={betAmount}
                      onChange={handleSliderChange}
                      className="poker-slider"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStepAdjust(stepSize)}
                    className="poker-slider-step-btn"
                    disabled={betAmount >= maxBet}
                    title={`Increase by ${stepSize} PTS`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            {/* 3 Core Action Buttons: Fold, Check/Call, Bet/Raise */}
            <div className="poker-actions-grid">
              {/* FOLD */}
              <button
                type="button"
                onClick={() => onAction && onAction('fold', 0)}
                className="poker-action-btn fold"
              >
                <span className="poker-btn-main-text">FOLD</span>
                <span className="poker-btn-sub-text">Give up hand</span>
              </button>

              {/* CHECK or CALL */}
              {canCheck ? (
                <button
                  type="button"
                  onClick={() => onAction && onAction('check', 0)}
                  className="poker-action-btn check"
                >
                  <span className="poker-btn-main-text">CHECK</span>
                  <span className="poker-btn-sub-text">Pass action</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAction && onAction('call', callAmount)}
                  className="poker-action-btn call"
                >
                  <span className="poker-btn-main-text">
                    CALL {formatPoints(Math.min(heroPlayer.chips, callAmount))}
                  </span>
                  <span className="poker-btn-sub-text">Match current bet</span>
                </button>
              )}

              {/* BET or RAISE */}
              {heroPlayer.chips > callAmount ? (
                <button
                  type="button"
                  onClick={() => onAction && onAction(currentBet === 0 ? 'bet' : 'raise', betAmount)}
                  className="poker-action-btn raise"
                >
                  <span className="poker-btn-main-text">
                    {currentBet === 0 ? 'BET' : 'RAISE TO'} {formatPoints(betAmount)}
                  </span>
                  <span className="poker-btn-sub-text">Increase stakes</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="poker-action-btn"
                  style={{ background: '#1e293b', color: '#64748b', cursor: 'not-allowed', border: '1px solid #334155' }}
                >
                  <span className="poker-btn-main-text">ALL IN</span>
                  <span className="poker-btn-sub-text">No chips left</span>
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
