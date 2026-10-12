import React from 'react';
import { Mail, ArrowRight, X, Coins } from 'lucide-react';
import { formatPoints } from '../lib/formatters';

export const InviteToast = ({
  invite = null,
  onAccept = null,
  onDecline = null
}) => {
  if (!invite) return null;

  return (
    <div className="invite-toast-container animate-bounce-subtle">
      <div className="invite-toast-box">
        {/* Left Icon */}
        <div className="invite-toast-icon-wrap">
          <Mail className="w-5 h-5 text-amber-400 animate-pulse" />
        </div>

        {/* Info */}
        <div className="invite-toast-content">
          <div className="invite-toast-title">
            <span>Table Invitation</span>
            <span className="invite-toast-badge">{invite.roomCode}</span>
          </div>

          <p className="invite-toast-desc">
            <strong className="text-amber-300">{invite.fromUsername}</strong> invited you to play at{' '}
            <span className="text-white font-semibold">"{invite.roomName}"</span>
          </p>

          <div className="invite-toast-meta">
            <span>Blinds: {formatPoints(invite.smallBlind ?? 2)}/{formatPoints(invite.bigBlind ?? 4)}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Coins className="w-3 h-3 text-amber-400" />
              {formatPoints(invite.startingStack || 1000)}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="invite-toast-actions">
            <button
              type="button"
              onClick={() => onAccept && onAccept(invite)}
              className="invite-toast-accept-btn"
            >
              <span>Join Table</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDecline && onDecline()}
              className="invite-toast-decline-btn"
            >
              <span>Decline</span>
            </button>
          </div>
        </div>

        {/* Close X */}
        <button
          type="button"
          onClick={() => onDecline && onDecline()}
          className="invite-toast-close"
          title="Dismiss"
        >
          <X className="w-4 h-4 text-slate-400 hover:text-white" />
        </button>
      </div>
    </div>
  );
};
