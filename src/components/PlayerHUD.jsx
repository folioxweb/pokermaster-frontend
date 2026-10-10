import React, { useState, useEffect } from 'react';
import { playChipClink } from '../lib/soundEffects';
import { formatPoints, formatPointsOnly } from '../lib/formatters';
import { Coins, Clock } from 'lucide-react';

export const PlayerHUD = ({
  isMyTurn = false,
  heroPlayer = null,
  currentTurnPlayerName = '',
  currentBet = 0,
  minRaise = 20,
  bigBlind = 20,
  mainPot = 0,
  handRank = null, // { name: 'Two Pair', description: 'Two Pair, Kings and Queens' }
  turnTimeLeft = 25,
  turnMaxTime = 25,
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

  const applyPreset = (type) => {
    let amt = minBetAllowed;
    if (type === 'min') {
      amt = minBetAllowed;
    } else if (type === '2.5bb') {
      amt = Math.min(maxBet, Math.max(minBetAllowed, Math.round(bigBlind * 2.5)));
    } else if (type === '3bb') {
      amt = Math.min(maxBet, Math.max(minBetAllowed, bigBlind * 3));
    } else if (type === 'half_pot') {
      amt = Math.min(maxBet, Math.max(minBetAllowed, Math.round(currentBet + (mainPot * 0.5))));
    } else if (type === 'pot') {
      amt = Math.min(maxBet, Math.max(minBetAllowed, currentBet + mainPot));
    } else if (type === 'all_in') {
      amt = maxBet;
    }
    setBetAmount(amt);
    playChipClink();
  };

  return (
    <div className="poker-hud-wrapper">
      {/* Hero Hand Rank Preview Pill */}
      {handRank && handRank.description && (
        <div className="poker-hand-rank-pill">
          <div className="poker-hand-rank-content">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
            <span style={{ fontWeight: 900, color: '#a5b4fc', textTransform: 'uppercase' }}>
              {handRank.name}:
            </span>
            <span style={{ fontWeight: 700, color: '#ffffff' }}>
              {handRank.description}
            </span>
          </div>
        </div>
      )}

      {/* Main Action HUD Panel */}
      <div className={`poker-hud-panel ${isMyTurn ? 'active' : ''}`}>
        {/* Hero Identity & Live Countdown Timer Bar */}
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

          {isMyTurn ? (
            <div className={`poker-hud-timer-badge ${turnTimeLeft <= 5 ? 'urgent' : ''}`}>
              <Clock className="w-3.5 h-3.5" />
              <span>YOUR TURN: <strong>{turnTimeLeft}s</strong></span>
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
                  <button type="button" onClick={() => applyPreset('min')} className="poker-preset-btn">Min</button>
                  <button type="button" onClick={() => applyPreset('2.5bb')} className="poker-preset-btn">2.5x BB</button>
                  <button type="button" onClick={() => applyPreset('3bb')} className="poker-preset-btn">3x BB</button>
                  <button type="button" onClick={() => applyPreset('half_pot')} className="poker-preset-btn">1/2 Pot</button>
                  <button type="button" onClick={() => applyPreset('pot')} className="poker-preset-btn">Pot</button>
                  <button type="button" onClick={() => applyPreset('all_in')} className="poker-preset-btn" style={{ background: '#881337', color: '#fecdd3', borderColor: '#be123c' }}>All-In</button>
                </div>

                <div className="poker-slider-row">
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8' }}>
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
                  <span style={{ fontSize: '11px', fontWeight: 900, color: '#fbbf24' }}>
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
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>
                Waiting for {currentTurnPlayerName || 'other players'} to act...
              </span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 900, color: '#fbbf24' }}>
              Your Stack: {formatPoints(heroPlayer.chips || 0)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
