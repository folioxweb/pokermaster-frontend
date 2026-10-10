import React from 'react';
import { CardAsset } from './CardAsset';
import { ChipStack } from './ChipStack';
import { BadgeAsset } from './BadgeAsset';

export const PlayerSeat = ({
  player = null,
  seatIndex = 0,
  position = { left: '50%', top: '50%' },
  isHero = false,
  isDealer = false,
  isSB = false,
  isBB = false,
  isCurrentTurn = false,
  turnTimeLeft = 25,
  turnMaxTime = 25,
  isWinner = false,
  onSit = null
}) => {
  // Empty seat state
  if (!player) {
    return (
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center transition-all duration-300 pointer-events-auto"
        style={{ left: position.left, top: position.top }}
      >
        <button
          onClick={() => onSit && onSit(seatIndex)}
          className="group flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 border-dashed border-emerald-500/30 hover:border-emerald-400 bg-slate-900/40 hover:bg-emerald-950/40 backdrop-blur-sm transition-all shadow-inner hover:scale-105 cursor-pointer"
        >
          <span className="text-[11px] font-semibold text-emerald-400/80 group-hover:text-emerald-300">
            Sit
          </span>
          <span className="text-[9px] text-slate-400">Seat {seatIndex + 1}</span>
        </button>
      </div>
    );
  }

  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';
  const progressRatio = Math.max(0, Math.min(1, turnTimeLeft / turnMaxTime));
  const strokeDashoffset = 125 * (1 - progressRatio);

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-all duration-300 z-20 ${
        isFolded ? 'opacity-40 grayscale-[40%]' : 'opacity-100'
      }`}
      style={{ left: position.left, top: position.top }}
    >
      {/* Dealer / Blind Badges */}
      <div className="absolute -top-3 -right-3 flex items-center space-x-1 z-30">
        {isDealer && <BadgeAsset type="dealer" />}
        {isSB && <BadgeAsset type="sb" />}
        {isBB && <BadgeAsset type="bb" />}
        {isAllIn && <BadgeAsset type="allin" />}
      </div>

      {/* Hole Cards Container */}
      <div className="flex items-center -space-x-5 mb-1.5 transition-transform duration-200 hover:-translate-y-1">
        {player.cards && player.cards.length >= 2 ? (
          <>
            <CardAsset
              card={player.cards[0]}
              hidden={!isHero && !player.shownCards}
              highlight={isWinner}
              className="w-11 h-15 shadow-xl"
            />
            <CardAsset
              card={player.cards[1]}
              hidden={!isHero && !player.shownCards}
              highlight={isWinner}
              className="w-11 h-15 shadow-xl"
            />
          </>
        ) : (
          player.status !== 'sitting_out' && (
            <>
              <CardAsset hidden={true} className="w-11 h-15 shadow-xl" />
              <CardAsset hidden={true} className="w-11 h-15 shadow-xl" />
            </>
          )
        )}
      </div>

      {/* Player Avatar & HUD Box */}
      <div className="relative flex flex-col items-center">
        {/* Animated Turn Timer Ring */}
        {isCurrentTurn && (
          <svg className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)] pointer-events-none z-10">
            <circle
              cx="50%"
              cy="50%"
              r="40%"
              fill="none"
              stroke="#eab308"
              strokeWidth="3"
              strokeDasharray="125"
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]"
            />
          </svg>
        )}

        <div
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-2xl backdrop-blur-md border transition-all duration-300 shadow-xl ${
            isCurrentTurn
              ? 'bg-amber-950/80 border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/20'
              : isWinner
              ? 'bg-emerald-950/90 border-emerald-400 ring-2 ring-emerald-400/60 shadow-emerald-500/30'
              : isHero
              ? 'bg-slate-900/90 border-blue-500/50 ring-1 ring-blue-500/30'
              : 'bg-slate-950/85 border-slate-700/60'
          }`}
        >
          {/* Avatar Icon */}
          <div className="relative w-8 h-8 rounded-full overflow-hidden flex items-center justify-center font-bold text-xs text-white bg-gradient-to-br from-indigo-600 to-purple-800 border border-slate-600/60 shrink-0 shadow-inner">
            {player.avatar_url ? (
              <img src={player.avatar_url} alt={player.username} className="w-full h-full object-cover" />
            ) : (
              <span>{player.username ? player.username.slice(0, 2).toUpperCase() : 'P'}</span>
            )}
          </div>

          {/* Name & Chips */}
          <div className="flex flex-col text-left">
            <div className="flex items-center space-x-1">
              <span className="text-[12px] font-bold text-slate-100 truncate max-w-[70px]">
                {player.username}
              </span>
              {isHero && (
                <span className="text-[9px] font-extrabold uppercase px-1 rounded bg-blue-500/30 text-blue-300 border border-blue-400/30">
                  YOU
                </span>
              )}
            </div>
            <span className="text-[11px] font-extrabold text-amber-300">
              ${player.chips?.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Action Status Pill */}
        {player.last_action && (
          <div
            className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase shadow-md transition-all ${
              player.last_action === 'fold'
                ? 'bg-rose-900/90 text-rose-200 border border-rose-700/60'
                : player.last_action === 'check'
                ? 'bg-slate-800/90 text-slate-200 border border-slate-600'
                : player.last_action === 'call'
                ? 'bg-sky-900/90 text-sky-200 border border-sky-600/60'
                : player.last_action === 'raise' || player.last_action === 'bet'
                ? 'bg-amber-900/90 text-amber-200 border border-amber-500/60'
                : 'bg-emerald-900/90 text-emerald-200 border border-emerald-600/60'
            }`}
          >
            {player.last_action}
          </div>
        )}
      </div>

      {/* Chip Bet on Felt in Front of Player */}
      {player.current_round_bet > 0 && (
        <div className="mt-2 scale-90">
          <ChipStack amount={player.current_round_bet} />
        </div>
      )}
    </div>
  );
};
