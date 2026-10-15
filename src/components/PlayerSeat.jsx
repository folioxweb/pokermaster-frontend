import React from 'react';
import { CardAsset } from './CardAsset';
import { BadgeAsset } from './BadgeAsset';
import { ChipBadge } from './ChipStack';
import { formatPoints, formatPointsCompact } from '../lib/formatters';

export const PlayerSeat = ({
  player = null,
  seatIndex = 0,
  position = { left: '50%', top: '50%' },
  isHero = false,
  isHandEnded = false,
  isDealer = false,
  isSB = false,
  isBB = false,
  isCurrentTurn = false,
  turnTimeLeft = 120,
  turnMaxTime = 120,
  isWinner = false,
  winningCards = [],
  onSit = null,
  isCreator = false,
  onRemovePlayer = null,
  onAddBotToSeat = null
}) => {
  // Empty seat state (Keeps other players' positions rock-solid!)
  if (!player) {
    return (
      <div
        className="poker-seat vacant"
        style={{ left: position.left, top: position.top }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
          <button
            onClick={() => onSit && onSit(seatIndex)}
            className="poker-empty-seat-btn"
            title={`Take Seat ${seatIndex + 1}`}
          >
            <span>+ SIT</span>
            <span style={{ fontSize: '8px', opacity: 0.7 }}>Seat {seatIndex + 1}</span>
          </button>
          {isCreator && isHandEnded && onAddBotToSeat && (
            <button
              onClick={() => onAddBotToSeat(seatIndex)}
              className="poker-empty-bot-btn"
              title={`Add Bot to Seat ${seatIndex + 1}`}
            >
              <span>+ Bot</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';
  const isSittingOut = player.status === 'sitting_out';

  // CRITICAL POKER SECURITY: Opponent hole cards are STRICTLY protected.
  // ONLY visible if:
  // 1. It is Hero's own seat (isHero), OR
  // 2. The hand has ended at showdown (isHandEnded) AND (player won at showdown OR player explicitly revealed cards)
  const isCardVisible = Boolean(isHero || (isHandEnded && (isWinner || player.shownCards)));

  // Show hole cards if player has cards or is active in the hand
  const hasCards = Boolean(player.hasCards || (player.cards && player.cards.length >= 2) || (!isSittingOut && !isHandEnded && !isFolded));

  // SVG turn timer circle stroke dashoffset
  const isNoLimit = !turnMaxTime || turnMaxTime <= 0;
  const progressRatio = isNoLimit ? 1 : Math.max(0, Math.min(1, turnTimeLeft / turnMaxTime));
  const strokeDashoffset = isNoLimit ? 0 : 140 * (1 - progressRatio);

  let statusClass = '';
  if (isCurrentTurn) statusClass = 'active-turn';
  else if (isWinner) statusClass = 'winner';
  else if (isHero) statusClass = 'hero';

  return (
    <div
      className={`poker-seat ${isFolded ? 'folded' : ''}`}
      style={{ left: position.left, top: position.top }}
    >
      {/* Dealer / Blind Badges (Positioned cleanly on top-right of pod) */}
      <div className="poker-badge-container">
        {isDealer && <BadgeAsset type="dealer" />}
        {isSB && <BadgeAsset type="sb" />}
        {isBB && <BadgeAsset type="bb" />}
        {isAllIn && <BadgeAsset type="allin" />}
      </div>

      {/* Hole Cards (Rendered neatly above the player pod) */}
      {hasCards && (
        <div className={`poker-hole-cards-row ${isHero ? 'hero-cards-row' : ''}`}>
          <CardAsset
            card={isCardVisible ? player.cards?.[0] : null}
            hidden={!isCardVisible}
            highlight={Boolean((isWinner && isHandEnded) || (isHandEnded && winningCards && winningCards.includes(player.cards?.[0])))}
            isCommunity={false}
            isHero={isHero}
          />
          <CardAsset
            card={isCardVisible ? player.cards?.[1] : null}
            hidden={!isCardVisible}
            highlight={Boolean((isWinner && isHandEnded) || (isHandEnded && winningCards && winningCards.includes(player.cards?.[1])))}
            isCommunity={false}
            isHero={isHero}
          />
        </div>
      )}

      {/* Player Information Box (No coins on table felt) */}
      <div className={`poker-player-box ${statusClass}`}>
        {/* Turn Countdown Ring */}
        {isCurrentTurn && (
          <svg className="poker-turn-timer-ring">
            <rect
              x="2"
              y="2"
              width="calc(100% - 4px)"
              height="calc(100% - 4px)"
              rx="12"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeDasharray="140"
              strokeDashoffset={strokeDashoffset}
              style={{ transition: isNoLimit ? 'none' : 'stroke-dashoffset 1s linear' }}
            />
          </svg>
        )}

        {/* Player Avatar */}
        <div className="poker-avatar">
          {player.username ? player.username.slice(0, 2).toUpperCase() : 'P'}
        </div>

        {/* Name & Chips (Both Points and Currency) */}
        <div className="poker-details">
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span className="poker-username">{player.username}</span>
            {isHero && (
              <span style={{ fontSize: '8px', fontWeight: 900, color: '#60a5fa', background: 'rgba(37,99,235,0.25)', padding: '1px 3px', borderRadius: '3px' }}>
                YOU
              </span>
            )}
            {player.isBot && (
              <span style={{ fontSize: '7.5px', fontWeight: 900, color: '#c084fc', background: 'rgba(168,85,247,0.2)', padding: '1px 3px', borderRadius: '3px' }}>
                BOT
              </span>
            )}
          </div>
          {/* Display Stack as Points and Currency */}
          <span className="poker-chips">
            {formatPoints(player.chips || 0)}
          </span>
        </div>

        {/* Host Remove/Kick Button (Only visible to Room Owner on non-hero seats) */}
        {isCreator && !isHero && onRemovePlayer && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemovePlayer(player);
            }}
            className="poker-seat-kick-btn"
            title={`Remove ${player.username} (${player.isBot ? 'Bot' : 'Player'})`}
          >
            ✕
          </button>
        )}
      </div>

      {/* Action / Current Bet Status Pill (Cleanly displayed in pod, NOT on felt) */}
      {player.current_round_bet > 0 ? (
        <div style={{ marginTop: '2px', display: 'flex', justifyContent: 'center' }}>
          <ChipBadge amount={player.current_round_bet} />
        </div>
      ) : player.last_action ? (
        <div className={`poker-action-pill ${player.last_action}`}>
          {player.last_action}
        </div>
      ) : null}
    </div>
  );
};
