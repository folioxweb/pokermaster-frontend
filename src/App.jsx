import React, { useState, useEffect } from 'react';
import { AuthPage } from './components/AuthPage';
import { LobbyPage } from './components/LobbyPage';
import { PokerTable } from './components/PokerTable';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeGameRoom, setActiveGameRoom] = useState(null); // null when in lobby
  const [loadingInitial, setLoadingInitial] = useState(true);

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

  if (loadingInitial) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Loading PokerMaster...
          </span>
        </div>
      </div>
    );
  }

  // View 1: Auth Screen (Login / Register unique username & password)
  if (!currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  // View 2: Active Poker Table
  if (activeGameRoom) {
    return (
      <PokerTable
        gameRoom={activeGameRoom}
        user={currentUser}
        onLeaveTable={handleLeaveTable}
      />
    );
  }

  // View 3: Structured Start / Lobby Page
  return (
    <LobbyPage
      user={currentUser}
      onLogout={handleLogout}
      onJoinGame={handleJoinGame}
    />
  );
}
