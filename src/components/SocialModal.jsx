import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Mail,
  X,
  Search,
  Check,
  UserCheck,
  LogOut,
  ArrowRight,
  Send,
  Trash2,
  Clock,
  Sparkles
} from 'lucide-react';
import { formatPoints } from '../lib/formatters';

export const SocialModal = ({
  isOpen = false,
  onClose = null,
  currentUser = null,
  activeGameRoom = null,
  onlineUsers = [],
  friends = [],
  pendingRequests = [],
  onSendInvite = null,
  onSendFriendRequest = null,
  onAcceptFriendRequest = null,
  onDeclineFriendRequest = null,
  onRemoveFriend = null,
  onJoinTable = null
}) => {
  const [activeTab, setActiveTab] = useState('online'); // 'online' | 'friends' | 'requests'
  const [friendSearchQuery, setFriendSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [invitedSeats, setInvitedSeats] = useState(new Set());

  if (!isOpen) return null;

  // Filter out hero from online list
  const otherOnlineUsers = onlineUsers.filter(
    (u) => u.username?.toLowerCase() !== currentUser?.username?.toLowerCase()
  );

  const filteredOnline = otherOnlineUsers.filter((u) =>
    u.username?.toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const isFriend = (username) => {
    return friends.some((f) => f.username?.toLowerCase() === username?.toLowerCase());
  };

  const handleInviteClick = (user) => {
    if (!activeGameRoom) return;
    setInvitedSeats((prev) => new Set([...prev, user.username]));
    if (onSendInvite) {
      onSendInvite(user, activeGameRoom);
    }
  };

  const handleAddFriendSubmit = (e) => {
    e.preventDefault();
    if (!friendSearchQuery.trim()) return;
    if (onSendFriendRequest) {
      onSendFriendRequest(friendSearchQuery.trim());
    }
    setFriendSearchQuery('');
  };

  return (
    <div className="social-modal-overlay" onClick={onClose}>
      <div className="social-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="social-modal-drag-indicator" />
        {/* Header */}
        <div className="social-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="social-modal-icon-badge">
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="social-modal-title">PokerMaster Social</h2>
              <p className="social-modal-sub">
                {activeGameRoom
                  ? `Table: ${activeGameRoom.roomName || activeGameRoom.roomCode}`
                  : 'Live players, friends & table invites'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="social-modal-close-btn"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="social-tabs-bar">
          <button
            type="button"
            onClick={() => setActiveTab('online')}
            className={`social-tab-btn ${activeTab === 'online' ? 'active' : ''}`}
          >
            <span className="online-indicator-dot" />
            <span>Online ({otherOnlineUsers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`social-tab-btn ${activeTab === 'friends' ? 'active' : ''}`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Friends ({friends.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`social-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Requests</span>
            {pendingRequests.length > 0 && (
              <span className="social-badge-count">{pendingRequests.length}</span>
            )}
          </button>
        </div>

        {/* Tab 1: Online Users */}
        {activeTab === 'online' && (
          <div className="social-content-pane">
            {/* Search filter */}
            <div className="social-search-box">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search online players..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="social-search-input"
              />
            </div>

            {/* List */}
            {filteredOnline.length === 0 ? (
              <div className="social-empty-state">
                <span className="text-2xl mb-1">👀</span>
                <p className="social-empty-title">No other players found</p>
                <p className="social-empty-desc">
                  Open a second browser tab or invite friends to see them appear here in real time!
                </p>
              </div>
            ) : (
              <div className="social-user-list">
                {filteredOnline.map((user) => {
                  const inGame = user.status === 'in_table' && user.roomCode;
                  const alreadyInvited = invitedSeats.has(user.username);
                  const isUserFriend = isFriend(user.username);

                  return (
                    <div key={user.username} className="social-user-row">
                      <div className="social-user-left">
                        <div className="social-avatar">
                          {user.username.slice(0, 2).toUpperCase()}
                          <span
                            className={`social-status-dot ${inGame ? 'in-game' : 'in-lobby'}`}
                          />
                        </div>
                        <div className="social-user-details">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="social-username">{user.username}</span>
                            {isUserFriend && (
                              <span className="friend-mini-badge" title="Friend">
                                <Check className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                          <span className="social-status-text">
                            {inGame ? (
                              <span className="text-amber-400">
                                🟡 Playing • {user.roomName || user.roomCode}
                              </span>
                            ) : (
                              <span className="text-emerald-400">🟢 In Lobby</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="social-user-actions">
                        {/* Invite to Table (if Hero is in a room) */}
                        {activeGameRoom && (
                          <button
                            type="button"
                            onClick={() => handleInviteClick(user)}
                            disabled={alreadyInvited}
                            className={`social-action-btn invite ${alreadyInvited ? 'sent' : ''}`}
                            title="Invite to your current table"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>{alreadyInvited ? 'Invited' : 'Invite'}</span>
                          </button>
                        )}

                        {/* Join their room (if user is in a room and hero is in lobby) */}
                        {!activeGameRoom && inGame && (
                          <button
                            type="button"
                            onClick={() => onJoinTable && onJoinTable(user.roomCode)}
                            className="social-action-btn join"
                            title={`Join ${user.username}'s table`}
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Join</span>
                          </button>
                        )}

                        {/* Add Friend Button if not friend */}
                        {!isUserFriend && (
                          <button
                            type="button"
                            onClick={() => onSendFriendRequest && onSendFriendRequest(user.username)}
                            className="social-action-btn friend"
                            title={`Add ${user.username} to friends`}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Friends */}
        {activeTab === 'friends' && (
          <div className="social-content-pane">
            {/* Add Friend Form */}
            <form onSubmit={handleAddFriendSubmit} className="social-add-friend-form">
              <div style={{ position: 'relative', flex: 1 }}>
                <Search className="w-4 h-4 text-slate-400" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <input
                  type="text"
                  placeholder="Enter username to add friend..."
                  value={friendSearchQuery}
                  onChange={(e) => setFriendSearchQuery(e.target.value)}
                  className="social-form-input"
                  style={{ paddingLeft: '36px' }}
                />
              </div>
              <button type="submit" className="social-add-btn">
                <UserPlus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </form>

            {/* Friends List */}
            {friends.length === 0 ? (
              <div className="social-empty-state">
                <span className="text-2xl mb-1">🤝</span>
                <p className="social-empty-title">Your friends list is empty</p>
                <p className="social-empty-desc">
                  Type a username above or click "+ Add Friend" in the Online list to connect!
                </p>
              </div>
            ) : (
              <div className="social-user-list">
                {friends.map((friend) => {
                  const onlinePresence = onlineUsers.find(
                    (u) => u.username?.toLowerCase() === friend.username?.toLowerCase()
                  );
                  const isOnline = Boolean(onlinePresence);
                  const inGame = onlinePresence?.status === 'in_table' && onlinePresence?.roomCode;

                  return (
                    <div key={friend.id || friend.username} className="social-user-row">
                      <div className="social-user-left">
                        <div className="social-avatar">
                          {friend.username.slice(0, 2).toUpperCase()}
                          <span
                            className={`social-status-dot ${
                              inGame ? 'in-game' : isOnline ? 'in-lobby' : 'offline'
                            }`}
                          />
                        </div>
                        <div className="social-user-details">
                          <span className="social-username">{friend.username}</span>
                          <span className="social-status-text">
                            {inGame ? (
                              <span className="text-amber-400">
                                🟡 Playing • {onlinePresence.roomName || onlinePresence.roomCode}
                              </span>
                            ) : isOnline ? (
                              <span className="text-emerald-400">🟢 Online (In Lobby)</span>
                            ) : (
                              <span className="text-slate-500">⚫ Offline</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="social-user-actions">
                        {/* Invite if Hero is at a table and Friend is online */}
                        {activeGameRoom && isOnline && (
                          <button
                            type="button"
                            onClick={() => handleInviteClick(friend)}
                            className="social-action-btn invite"
                            title="Invite to table"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Invite</span>
                          </button>
                        )}

                        {/* Join if friend is in a room */}
                        {inGame && (
                          <button
                            type="button"
                            onClick={() => onJoinTable && onJoinTable(onlinePresence.roomCode)}
                            className="social-action-btn join"
                            title="Join table"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Join</span>
                          </button>
                        )}

                        {/* Remove Friend */}
                        <button
                          type="button"
                          onClick={() => onRemoveFriend && onRemoveFriend(friend.id)}
                          className="social-action-btn remove"
                          title="Remove Friend"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Requests */}
        {activeTab === 'requests' && (
          <div className="social-content-pane">
            {pendingRequests.length === 0 ? (
              <div className="social-empty-state">
                <span className="text-2xl mb-1">📬</span>
                <p className="social-empty-title">No pending requests</p>
                <p className="social-empty-desc">
                  When other players send you a friend request, they will appear right here!
                </p>
              </div>
            ) : (
              <div className="social-user-list">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="social-user-row">
                    <div className="social-user-left">
                      <div className="social-avatar">
                        {req.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="social-user-details">
                        <span className="social-username">{req.username}</span>
                        <span className="social-status-text text-amber-400">
                          Wants to be your friend
                        </span>
                      </div>
                    </div>

                    <div className="social-user-actions">
                      <button
                        type="button"
                        onClick={() => onAcceptFriendRequest && onAcceptFriendRequest(req.id)}
                        className="social-action-btn accept"
                        title="Accept Request"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeclineFriendRequest && onDeclineFriendRequest(req.id)}
                        className="social-action-btn decline"
                        title="Decline"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
