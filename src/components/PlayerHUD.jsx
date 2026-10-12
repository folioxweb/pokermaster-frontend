import React, { useState, useEffect } from 'react';
import { playChipClink } from '../lib/soundEffects';
import { formatPoints, formatPointsOnly } from '../lib/formatters';
import { Coins, Clock } from 'lucide-react';

export const PlayerHUD = ({
  isMyTurn = false,
  heroPlayer = null,
  currentTurnPlayerName = '',
  currentBet = 0,
  minRaise = 4,
  bigBlind = 4,
  mainPot = 0,
  handRank = null, // { name: 'Two Pair', description: 'Two Pair, Kings and Queens' }
  turnTimeLeft = 0,
  turnMaxTime = 0,
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
    const val = Number(e.target.value);
    setBetAmount(val);
    playChipClink();
  };

  const multipliers = [2, 4, 8, 16];

  const calcPresetAmount = (multiplier) => {
    // When no bet has been made, base is the Big Blind (e.g. Bet 2 = 2 * BB)
    // When facing a bet, base is max(currentBet, bigBlind)
    const base = Math.max(currentBet, bigBlind || 20);
    const target = base * multiplier;
    return Math.min(maxBet, Math.max(minBetAllowed, target));
  };

  const applyMultiplier = (multiplier) => {
    const amt = calcPresetAmount(multiplier);
    setBetAmount(amt);
    playChipClink();
  };

  const applyPreset = (type) => {
    let amt = minBetAllowed;
    if (type === 'min') {
      amt = minBetAllowed;
    } else if (type === 'all_in') {
      amt = maxBet;
    }
    setBetAmount(amt);
    playChipClink();
  };

  return (
    <div className="poker-hud-wrapper">
      {/* Main Action HUD Panel */}
      <div className={`poker-hud-panel ${isMyTurn ? 'active' : ''}`}>
        {/* Hero Identity, Hand Rank & Live Countdown Timer Bar */}
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

          {/* Integrated Hand Rank Status Tag (Center) */}
          {handRank && handRank.description && (
            <div className="poker-hud-hand-badge" title={`${handRank.name}: ${handRank.description}`}>
              <span className="poker-hud-hand-dot" />
              <span className="poker-hud-hand-name">{handRank.name}:</span>
              <span className="poker-hud-hand-desc">{handRank.description}</span>
            </div>
          )}

          {isMyTurn ? (
            <div className={`poker-hud-timer-badge ${turnMaxTime > 0 && turnTimeLeft <= 5 ? 'urgent' : ''}`}>
              <Clock className="w-3.5 h-3.5" />
              <span>
                YOUR TURN: <strong>{turnMaxTime > 0 ? `${turnTimeLeft}s` : '∞ NO LIMIT'}</strong>
              </span>
            </div>
          ) : (
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
                  {/* Min Option */}
                  <button
                    type="button"
                    onClick={() => applyPreset('min')}
                    className={`poker-preset-btn ${betAmount === minBetAllowed ? 'active' : ''}`}
                  >
                    <span className="poker-preset-title">Min</span>
                    <span className="poker-preset-amount">{formatPointsOnly(minBetAllowed)}</span>
                  </button>

                  {/* Dynamic Blind Multipliers: Bet 2, Bet 4, Bet 8, Bet 16 (or Raise 2x, 4x, etc.) */}
                  {multipliers.map((m) => {
                    const amt = calcPresetAmount(m);
                    const isRaise = currentBet > 0;
                    const label = isRaise ? `Raise ${m}x` : `Bet ${m}`;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => applyMultiplier(m)}
                        className={`poker-preset-btn ${betAmount === amt ? 'active' : ''}`}
                      >
                        <span className="poker-preset-title">{label}</span>
                        <span className="poker-preset-amount">{formatPointsOnly(amt)}</span>
                      </button>
                    );
                  })}

                  {/* All-In Option */}
                  <button
                    type="button"
                    onClick={() => applyPreset('all_in')}
                    className={`poker-preset-btn all-in ${betAmount === maxBet ? 'active' : ''}`}
                  >
                    <span className="poker-preset-title">All-In</span>
                    <span className="poker-preset-amount">{formatPointsOnly(maxBet)}</span>
                  </button>
                </div>

                <div className="poker-slider-row">
                  <span className="poker-slider-minmax">
                    {formatPointsOnly(minBetAllowed)}
                  </span>
                  <input
                    type="range"
                    min={minBetAllowed}
                    max={maxBet}
                    step={bigBlind}
                    value={betAmount}
                    onChange={handleSliderChange}
                    className="poker-slider"
                  />
                  <span className="poker-slider-val">
                    {formatPoints(betAmount)}
                  </span>
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
