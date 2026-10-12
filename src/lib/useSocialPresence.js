import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { playNotificationChime } from './soundEffects';

export function useSocialPresence(currentUser, activeGameRoom, onJoinGame) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [incomingInvite, setIncomingInvite] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [isSocialOpen, setIsSocialOpen] = useState(false);

  const channelRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // 1. Fetch Friends & Requests (Database with LocalStorage fallback)
  const refreshFriends = useCallback(async () => {
    if (!currentUser) return;
    try {
      // Query poker_friendships
      const { data, error } = await supabase
        .from('poker_friendships')
        .select(`
          id,
          user_id,
          friend_id,
          status,
          created_at
        `)
        .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`);

      if (!error && Array.isArray(data)) {
        // Collect IDs of friends
        const accepted = [];
        const pending = [];

        for (const item of data) {
          const isSender = item.user_id === currentUser.id;
          const otherUserId = isSender ? item.friend_id : item.user_id;

          if (item.status === 'accepted') {
            accepted.push({
              id: item.id,
              userId: otherUserId,
              isSender
            });
          } else if (item.status === 'pending' && !isSender) {
            // Incoming request to currentUser
            pending.push({
              id: item.id,
              userId: otherUserId,
              isSender: false
            });
          }
        }

        // Fetch usernames for other users
        const allUserIds = [...accepted, ...pending].map(x => x.userId);
        if (allUserIds.length > 0) {
          const { data: userData } = await supabase
            .from('poker_users')
            .select('id, username, chips')
            .in('id', allUserIds);

          const userMap = new Map((userData || []).map(u => [u.id, u]));

          setFriends(accepted.map(a => ({
            ...a,
            username: userMap.get(a.userId)?.username || 'Player',
            chips: userMap.get(a.userId)?.chips || 0
          })));

          setPendingRequests(pending.map(p => ({
            ...p,
            username: userMap.get(p.userId)?.username || 'Player',
            chips: userMap.get(p.userId)?.chips || 0
          })));
          return;
        } else {
          setFriends([]);
          setPendingRequests([]);
          return;
        }
      }
    } catch (err) {
      console.warn('Friends database query fallback:', err);
    }

    // LocalStorage Fallback
    try {
      const stored = localStorage.getItem(`pokermaster_friends_${currentUser.username}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setFriends(parsed.friends || []);
        setPendingRequests(parsed.requests || []);
      }
    } catch (e) {}
  }, [currentUser]);

  // 2. Global Realtime Presence & Table Invites
  useEffect(() => {
    if (!currentUser) return;

    const channelName = 'poker_community_presence';
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: currentUser.id || currentUser.username }
      }
    });

    channelRef.current = channel;

    // Track online state
    const trackPresence = async () => {
      try {
        await channel.track({
          userId: currentUser.id,
          username: currentUser.username,
          status: activeGameRoom ? 'in_table' : 'in_lobby',
          roomCode: activeGameRoom?.roomCode || null,
          roomName: activeGameRoom?.roomName || null,
          chips: currentUser.chips || 0,
          updatedAt: Date.now()
        });
      } catch (err) {
        console.warn('Error tracking presence:', err);
      }
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const usersList = [];
        const seen = new Set();

        for (const key of Object.keys(presenceState)) {
          const presences = presenceState[key];
          if (Array.isArray(presences)) {
            for (const p of presences) {
              if (p.username && !seen.has(p.username)) {
                seen.add(p.username);
                usersList.push(p);
              }
            }
          }
        }
        setOnlineUsers(usersList);
      })
      .on('broadcast', { event: 'TABLE_INVITE' }, ({ payload }) => {
        if (!payload) return;
        if (payload.toUsername === currentUser.username) {
          playNotificationChime();
          setIncomingInvite(payload);
        }
      })
      .on('broadcast', { event: 'FRIEND_REQUEST' }, ({ payload }) => {
        if (!payload) return;
        if (payload.toUsername === currentUser.username) {
          playNotificationChime();
          showToast(`👥 ${payload.fromUsername} sent you a friend request!`);
          refreshFriends();
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await trackPresence();
        }
      });

    refreshFriends();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [currentUser, refreshFriends, showToast]);

  // Re-track when activeGameRoom changes
  useEffect(() => {
    if (channelRef.current && currentUser) {
      try {
        channelRef.current.track({
          userId: currentUser.id,
          username: currentUser.username,
          status: activeGameRoom ? 'in_table' : 'in_lobby',
          roomCode: activeGameRoom?.roomCode || null,
          roomName: activeGameRoom?.roomName || null,
          chips: currentUser.chips || 0,
          updatedAt: Date.now()
        });
      } catch (e) {}
    }
  }, [activeGameRoom, currentUser]);

  // 3. Send Table Invitation
  const sendTableInvite = async (targetUser, roomConfig) => {
    if (!targetUser || !roomConfig) return;

    const payload = {
      id: 'inv_' + Date.now(),
      fromUserId: currentUser.id,
      fromUsername: currentUser.username,
      toUserId: targetUser.userId || targetUser.id,
      toUsername: targetUser.username,
      roomCode: roomConfig.roomCode,
      roomName: roomConfig.roomName || 'Poker Table',
      smallBlind: roomConfig.smallBlind ?? 2,
      bigBlind: roomConfig.bigBlind ?? 4,
      startingStack: roomConfig.startingStack || 1000,
      createdAt: Date.now()
    };

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'TABLE_INVITE',
        payload
      });
    }

    try {
      await supabase.from('poker_invites').insert({
        from_user_id: currentUser.id || null,
        from_username: currentUser.username,
        to_user_id: targetUser.userId || null,
        to_username: targetUser.username,
        room_code: roomConfig.roomCode,
        room_name: roomConfig.roomName || 'Poker Table',
        status: 'pending'
      });
    } catch (e) {}

    showToast(`✉️ Invitation sent to ${targetUser.username}!`);
  };

  // 4. Send Friend Request
  const sendFriendRequest = async (targetUsername) => {
    const cleanUsername = targetUsername.trim();
    if (!cleanUsername) return;
    if (cleanUsername.toLowerCase() === currentUser.username.toLowerCase()) {
      showToast("You cannot add yourself as a friend!");
      return;
    }

    try {
      // Find user
      const { data: targetData } = await supabase
        .from('poker_users')
        .select('id, username')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (targetData) {
        await supabase.from('poker_friendships').upsert({
          user_id: currentUser.id,
          friend_id: targetData.id,
          status: 'pending'
        }, { onConflict: 'user_id,friend_id' });

        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'FRIEND_REQUEST',
            payload: {
              fromUsername: currentUser.username,
              toUsername: targetData.username
            }
          });
        }
        showToast(`👥 Friend request sent to ${targetData.username}!`);
        refreshFriends();
        return;
      }
    } catch (err) {
      console.warn('Friend request db error:', err);
    }

    // Local fallback
    const targetUser = onlineUsers.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    if (targetUser) {
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'FRIEND_REQUEST',
          payload: {
            fromUsername: currentUser.username,
            toUsername: targetUser.username
          }
        });
      }
      showToast(`👥 Friend request sent to ${targetUser.username}!`);
    } else {
      showToast(`User "${cleanUsername}" not found.`);
    }
  };

  // 5. Accept Friend Request
  const acceptFriendRequest = async (requestId) => {
    try {
      await supabase
        .from('poker_friendships')
        .update({ status: 'accepted' })
        .eq('id', requestId);
    } catch (e) {}
    showToast('🎉 Friend request accepted!');
    refreshFriends();
  };

  // 6. Decline Friend Request
  const declineFriendRequest = async (requestId) => {
    try {
      await supabase
        .from('poker_friendships')
        .delete()
        .eq('id', requestId);
    } catch (e) {}
    showToast('Friend request declined.');
    refreshFriends();
  };

  // 7. Remove Friend
  const removeFriend = async (friendshipId) => {
    try {
      await supabase
        .from('poker_friendships')
        .delete()
        .eq('id', friendshipId);
    } catch (e) {}
    showToast('Friend removed.');
    refreshFriends();
  };

  // 8. Accept Incoming Table Invite
  const acceptTableInvite = (invite) => {
    setIncomingInvite(null);
    if (onJoinGame && invite?.roomCode) {
      onJoinGame({
        roomId: invite.roomCode,
        roomCode: invite.roomCode,
        roomName: invite.roomName || 'Invited Table',
        isPractice: false,
        smallBlind: invite.smallBlind ?? 2,
        bigBlind: invite.bigBlind ?? 4,
        startingStack: invite.startingStack || 1000
      });
    }
  };

  const declineTableInvite = () => {
    setIncomingInvite(null);
  };

  return {
    onlineUsers,
    friends,
    pendingRequests,
    incomingInvite,
    toastMessage,
    isSocialOpen,
    setIsSocialOpen,
    sendTableInvite,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    acceptTableInvite,
    declineTableInvite,
    refreshFriends,
    showToast
  };
}
