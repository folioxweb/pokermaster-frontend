import React, { useState, useEffect } from 'react';
import { AuthPage } from './components/AuthPage';
import { LobbyPage } from './components/LobbyPage';
import { PokerTable } from './components/PokerTable';
import { BluffTable } from './components/BluffTable';
import { SocialModal } from './components/SocialModal';
import { InviteToast } from './components/InviteToast';
import { useSocialPresence } from './lib/useSocialPresence';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeGameRoom, setActiveGameRoom] = useState(null); // null when in lobby
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Theme State: 'light' (default for new users) | 'dark'
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('pokermaster-theme') || 'light';
    } catch {
      return 'light';
    }
  });

  // Apply theme to document root and update PWA status bar / theme-color
  useEffect(() => {
    try {
      localStorage.setItem('pokermaster-theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      if (theme === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
      const meta = document.getElementById('meta-theme-color') || document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', theme === 'light' ? '#f8fafc' : '#020617');
      }
    } catch (e) {
      console.warn('Theme update error:', e);
    }
  }, [theme]);

  const toggleTheme = (explicitTheme) => {
    if (typeof explicitTheme === 'string') {
      setTheme(explicitTheme);
    } else {
      setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    }
  };

  // Check persisted user on boot
  useEffect(() => {
    try {
      const stored = localStorage.getItem('pokermaster_user');
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Failed to parse user session:', e);
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  // Direct table invite via URL: e.g. https://domain/?room=PK-7389
  useEffect(() => {
    if (!currentUser) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room') || params.get('join');
      if (roomParam) {
        const cleanCode = roomParam.trim().toUpperCase();
        const isBluffCode = cleanCode.startsWith('BL-');
        supabase
          .from('poker_rooms')
          .select('*')
          .eq('code', cleanCode)
          .maybeSingle()
          .then(({ data, error }) => {
            if (data && !error) {
              handleJoinGame({
                roomId: data.id,
                roomCode: data.code,
                roomName: data.name,
                isPractice: false,
                gameType: isBluffCode ? 'bluff' : 'poker',
                hostUsername: data.host_username,
                maxPlayers: data.max_players || 6,
                startingStack: data.starting_stack || 1000,
                smallBlind: data.small_blind ?? 2,
                bigBlind: data.big_blind ?? 4,
                turnTime: data.turn_time_seconds ?? 0
              });
              // Clean query param from address bar without page reload
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          });
      }
    } catch (err) {
      console.warn('Direct invite link parse error:', err);
    }
  }, [currentUser]);

  const handleAuthSuccess = (user) => {
    setCurrentUser(user);
    setActiveGameRoom(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('pokermaster_user');
    setCurrentUser(null);
    setActiveGameRoom(null);
  };

  const handleJoinGame = (roomConfig) => {
    setActiveGameRoom(roomConfig);
  };

  const handleLeaveTable = () => {
    if (window.confirm('Leave table and return to lobby?')) {
      setActiveGameRoom(null);
    }
  };

  // Realtime Social Suite Hook (Presence, Friends, Invites)
  const social = useSocialPresence(currentUser, activeGameRoom, handleJoinGame);

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            Loading Taash Royale...
          </span>
        </div>
      </div>
    );
  }

  // View 1: Auth Screen (Login / Register unique username & password)
  if (!currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} theme={theme} onToggleTheme={toggleTheme} />;
  }

  return (
    <>
      {/* View 2: Active Poker / Bluff Table */}
      {activeGameRoom ? (
        activeGameRoom.gameType === 'bluff' || activeGameRoom.roomCode?.startsWith('BL-') || activeGameRoom.isBluff ? (
          <BluffTable
            gameRoom={activeGameRoom}
            user={currentUser}
            onLeaveTable={handleLeaveTable}
            onOpenSocial={() => social.setIsSocialOpen(true)}
            onlineCount={social.onlineUsers.length}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        ) : (
          <PokerTable
            gameRoom={activeGameRoom}
            user={currentUser}
            onLeaveTable={handleLeaveTable}
            onOpenSocial={() => social.setIsSocialOpen(true)}
            onlineCount={social.onlineUsers.length}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )
      ) : (
        /* View 3: Structured Start / Lobby Page */
        <LobbyPage
          user={currentUser}
          onLogout={handleLogout}
          onJoinGame={handleJoinGame}
          onOpenSocial={() => social.setIsSocialOpen(true)}
          onlineCount={social.onlineUsers.length}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {/* Realtime Floating Table Invite Toast */}
      <InviteToast
        invite={social.incomingInvite}
        onAccept={social.acceptTableInvite}
        onDecline={social.declineTableInvite}
      />

      {/* Realtime Social & Friends Modal / Mobile Bottom Sheet */}
      <SocialModal
        isOpen={social.isSocialOpen}
        onClose={() => social.setIsSocialOpen(false)}
        currentUser={currentUser}
        activeGameRoom={activeGameRoom}
        onlineUsers={social.onlineUsers}
        friends={social.friends}
        pendingRequests={social.pendingRequests}
        onSendInvite={social.sendTableInvite}
        onSendFriendRequest={social.sendFriendRequest}
        onAcceptFriendRequest={social.acceptFriendRequest}
        onDeclineFriendRequest={social.declineFriendRequest}
        onRemoveFriend={social.removeFriend}
        onJoinTable={(code) => {
          social.setIsSocialOpen(false);
          const isBluffCode = code.toUpperCase().startsWith('BL-');
          handleJoinGame({
            roomId: code,
            roomCode: code,
            roomName: `${isBluffCode ? 'Bluff' : 'Poker'} Table ${code}`,
            gameType: isBluffCode ? 'bluff' : 'poker',
            isPractice: false
          });
        }}
      />

      {/* Global Toast Notification */}
      {social.toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2 rounded-xl bg-slate-900/95 border border-amber-500/50 text-amber-300 text-xs font-bold shadow-2xl backdrop-blur-md animate-fade-in pointer-events-none">
          {social.toastMessage}
        </div>
      )}
    </>
  );
}

