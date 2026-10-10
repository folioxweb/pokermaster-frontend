import React, { useState, useEffect } from 'react';
import { playChipClink } from '../lib/soundEffects';

export const PlayerHUD = ({
  isMyTurn = false,
  heroPlayer = null,
  currentBet = 0,
  minRaise = 20,
  bigBlind = 20,
  mainPot = 0,
  handRank = null, // e.g. { name: 'Two Pair', description: 'Two Pair, Kings and Eights' }
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

  // Quick Bet Presets
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
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-40 select-none">
      {/* Hero Hand Rank Badge */}
      {handRank && handRank.description && (
        <div className="flex justify-center mb-2">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-slate-900/95 border border-indigo-500/50 shadow-xl backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black tracking-wide text-indigo-300 uppercase">
              {handRank.name}:
            </span>
            <span className="text-xs font-bold text-white">
              {handRank.description}
            </span>
          </div>
        </div>
      )}

      {/* Main Action HUD Panel */}
      <div
        className={`rounded-2xl p-3 backdrop-blur-xl border transition-all duration-300 shadow-2xl ${
          isMyTurn
            ? 'bg-slate-950/95 border-amber-500/70 shadow-amber-500/20 ring-1 ring-amber-400/40'
            : 'bg-slate-950/80 border-slate-800/80 opacity-75'
        }`}
      >
        {isMyTurn ? (
          <div className="flex flex-col space-y-2.5">
            {/* Quick Raise Presets Bar & Slider */}
            {heroPlayer.chips > callAmount && (
              <div className="flex flex-col space-y-1.5 pt-0.5">
                {/* Presets */}
                <div className="grid grid-cols-6 gap-1.5">
                  <button
                    onClick={() => applyPreset('min')}
                    className="py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    Min
                  </button>
                  <button
                    onClick={() => applyPreset('2.5bb')}
                    className="py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    2.5x BB
                  </button>
                  <button
                    onClick={() => applyPreset('3bb')}
                    className="py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    3x BB
                  </button>
                  <button
                    onClick={() => applyPreset('half_pot')}
                    className="py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    1/2 Pot
                  </button>
                  <button
                    onClick={() => applyPreset('pot')}
                    className="py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                  >
                    Pot
                  </button>
                  <button
                    onClick={() => applyPreset('all_in')}
                    className="py-1 rounded-lg text-[10px] font-extrabold bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700/60 transition cursor-pointer"
                  >
                    All-In
                  </button>
                </div>

                {/* Slider with Bet Counter */}
                <div className="flex items-center space-x-3 px-1">
                  <span className="text-[11px] font-bold text-slate-400">
                    ${minBetAllowed}
                  </span>
                  <input
                    type="range"
                    min={minBetAllowed}
                    max={maxBet}
                    step={bigBlind}
                    value={betAmount}
                    onChange={handleSliderChange}
                    className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                  <span className="text-[11px] font-bold text-amber-300">
                    ${betAmount}
                  </span>
                </div>
              </div>
            )}

            {/* Core Action Buttons: Fold, Check/Call, Bet/Raise */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* FOLD */}
              <button
                onClick={() => onAction && onAction('fold', 0)}
                className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-gradient-to-b from-rose-600 to-rose-800 hover:from-rose-500 hover:to-rose-700 text-white font-extrabold shadow-lg shadow-rose-900/40 border border-rose-400/40 active:scale-95 transition cursor-pointer"
              >
                <span className="text-sm tracking-wide">FOLD</span>
                <span className="text-[10px] opacity-80">Give up hand</span>
              </button>

              {/* CHECK or CALL */}
              {canCheck ? (
                <button
                  onClick={() => onAction && onAction('check', 0)}
                  className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white font-extrabold shadow-lg shadow-emerald-900/40 border border-emerald-400/40 active:scale-95 transition cursor-pointer"
                >
                  <span className="text-sm tracking-wide">CHECK</span>
                  <span className="text-[10px] opacity-80">Pass action</span>
                </button>
              ) : (
                <button
                  onClick={() => onAction && onAction('call', callAmount)}
                  className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-gradient-to-b from-sky-600 to-sky-800 hover:from-sky-500 hover:to-sky-700 text-white font-extrabold shadow-lg shadow-sky-900/40 border border-sky-400/40 active:scale-95 transition cursor-pointer"
                >
                  <span className="text-sm tracking-wide">CALL</span>
                  <span className="text-[10px] opacity-80">${Math.min(heroPlayer.chips, callAmount)}</span>
                </button>
              )}

              {/* BET or RAISE */}
              {heroPlayer.chips > callAmount ? (
                <button
                  onClick={() => onAction && onAction(currentBet === 0 ? 'bet' : 'raise', betAmount)}
                  className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-900/40 border border-amber-300 active:scale-95 transition cursor-pointer"
                >
                  <span className="text-sm tracking-wide">
                    {currentBet === 0 ? 'BET' : 'RAISE'}
                  </span>
                  <span className="text-[10px] font-bold opacity-90">${betAmount}</span>
                </button>
              ) : (
                <button
                  disabled
                  className="flex flex-col items-center justify-center py-2.5 rounded-xl bg-slate-800 text-slate-500 font-bold border border-slate-700 cursor-not-allowed"
                >
                  <span className="text-sm tracking-wide">RAISE</span>
                  <span className="text-[10px]">No chips</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-bold text-slate-400">
              Waiting for other players...
            </span>
            <span className="text-xs font-extrabold text-amber-300">
              Stack: ${heroPlayer.chips?.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
