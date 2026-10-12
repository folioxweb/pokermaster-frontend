import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Plus,
  LogIn,
  Bot,
  Users,
  User,
  Coins,
  LogOut,
  RefreshCw,
  Clock,
  Shield,
  Layers,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Shuffle,
  Trash2,
  Sun,
  Moon,
  Sparkles,
  Flame,
  Gamepad2
} from 'lucide-react';

import { formatPoints, formatPointsOnly } from '../lib/formatters';

export const LobbyPage = ({
  user,
  onLogout,
  onJoinGame,
  onOpenSocial = null,
  onlineCount = 1,
  theme = 'dark',
  onToggleTheme = null
}) => {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'create' | 'join' | 'practice' | 'profile'
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Game Mode State: 'poker' (Texas Hold'em) | 'bluff' (Bluff Master)
  const [selectedGameMode, setSelectedGameMode] = useState(() => {
    try {
      return localStorage.getItem('pokermaster_game_mode') || 'poker';
    } catch {
      return 'poker';
    }
  });
  const [tableFilter, setTableFilter] = useState('all'); // 'all' | 'poker' | 'bluff'

  const handleSelectGameMode = (mode) => {
    setSelectedGameMode(mode);
    try {
      localStorage.setItem('pokermaster_game_mode', mode);
    } catch {}
  };

  // Texas Hold'em Create Table Form State
  const [tableName, setTableName] = useState('Championship Ring');
  const [maxPlayers, setMaxPlayers] = useState(6); // 3 to 8
  const [smallBlind, setSmallBlind] = useState(2);
  const [bigBlind, setBigBlind] = useState(4);
  const [startingStack, setStartingStack] = useState(1000);
  const [turnTime, setTurnTime] = useState(0);
  const [creatingTable, setCreatingTable] = useState(false);
  const isCreatingRef = useRef(false);

  // Bluff Master Create Table Form State
  const [bluffTableName, setBluffTableName] = useState('Royal Bluffers');
  const [bluffMaxPlayers, setBluffMaxPlayers] = useState(6); // 2 to 8
  const [bluffDeckType, setBluffDeckType] = useState('single'); // 'single' (54) | 'double' (108)
  const [bluffChallengeTime, setBluffChallengeTime] = useState(8); // 0 (No Limit), 5, 8, 10, 15
  const [bluffChallengeRule, setBluffChallengeRule] = useState('anyone'); // 'anyone' | 'next_only'
  const [bluffPassAllowed, setBluffPassAllowed] = useState(true);
  const [bluffPracticeSeats, setBluffPracticeSeats] = useState(5);

  // Join Code State
  const [joinCode, setJoinCode] = useState('');

  // Practice State
  const [practiceSeats, setPracticeSeats] = useState(6);

  // Custom Game Options (matching Image 2)
  const [customOptionsOpen, setCustomOptionsOpen] = useState(true);
  const [gameEnd, setGameEnd] = useState('winner_takes_all');
  const [blindsFrequency, setBlindsFrequency] = useState('fast_5');
  const [allInMinRaiseException, setAllInMinRaiseException] = useState(true);
  const [showRemainingRiverCards, setShowRemainingRiverCards] = useState(false);

  // Fetch Active Rooms & Auto-Prune Abandoned Empty Tables
  const fetchRooms = async () => {
    setLoadingRooms(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('get_active_poker_rooms');
      let roomList = [];
      if (!error && Array.isArray(data)) {
        roomList = data;
      } else {
        // Fallback direct table query
        const { data: directData } = await supabase
          .from('poker_rooms')
          .select('*')
          .neq('status', 'closed')
          .neq('status', 'ended')
          .order('created_at', { ascending: false });
        if (directData) roomList = directData;
      }

      const now = Date.now();
      const validRooms = [];
      const staleEmptyIds = [];

      for (const r of roomList) {
        if (r.status === 'closed' || r.status === 'ended') continue;
        const pCount = Number(r.player_count || 0);
        const ageMs = r.created_at ? (now - new Date(r.created_at).getTime()) : 0;

        // Any table with 0 players that has been open for > 60 seconds is treated as abandoned.
        // It is omitted from the public lobby and marked closed.
        if (pCount === 0 && ageMs > 60000) {
          staleEmptyIds.push(r.id);
        } else {
          validRooms.push(r);
        }
      }

      setRooms(validRooms);

      // Silently close abandoned 0-player tables in Supabase in background
      if (staleEmptyIds.length > 0) {
        supabase
          .from('poker_rooms')
          .update({ status: 'closed' })
          .in('id', staleEmptyIds)
          .then(() => {});
      }
    } catch (err) {
      console.warn('Failed to fetch rooms:', err);
      setRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  };

  // Close / Delete a Table (Allowed ONLY for table creator, and ONLY if 0 players are seated)
  const handleCloseRoom = async (room, e) => {
    if (e) e.stopPropagation();

    // Protection 1: Active players protection - No one can delete a table with active players
    if ((room.player_count || 0) > 0) {
      alert('Cannot delete this table: There are active players currently seated at the table.');
      return;
    }

    // Protection 2: Creator ownership protection - Table created by user A can only be deleted by user A
    if (room.host_username && user?.username && room.host_username !== user.username) {
      alert(`Only the table creator (${room.host_username}) can delete this table.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to close and remove table "${room.name}"?`)) return;
    try {
      await supabase
        .from('poker_rooms')
        .update({ status: 'closed' })
        .eq('id', room.id);
      fetchRooms();
    } catch (err) {
      console.warn('Error closing room:', err);
    }
  };

  // Clean empty tables with 0 players created by the current user
  const handleCleanEmptyRooms = async () => {
    const myEmptyRooms = rooms.filter(
      (r) => (r.player_count || 0) === 0 && (!r.host_username || r.host_username === user?.username)
    );
    if (myEmptyRooms.length === 0) {
      alert('You have no empty tables to clean up.');
      return;
    }
    try {
      const emptyIds = myEmptyRooms.map((r) => r.id);
      await supabase
        .from('poker_rooms')
        .update({ status: 'closed' })
        .in('id', emptyIds);
      fetchRooms();
    } catch (err) {
      console.warn('Error cleaning empty rooms:', err);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 8000);
    return () => clearInterval(interval);
  }, []);

  // Handle Create Room (Supports Texas Hold'em and Bluff Master)
  const handleCreateTable = async (e) => {
    if (e) e.preventDefault();
    if (isCreatingRef.current || creatingTable) return;
    isCreatingRef.current = true;
    setCreatingTable(true);
    setErrorMsg(null);

    // --- Bluff Master Room Creation ---
    if (selectedGameMode === 'bluff') {
      const cleanBluffName = (bluffTableName || '').trim() || 'Royal Bluffers';
      const generatedCode = 'BL-' + Math.floor(1000 + Math.random() * 9000);
      try {
        const { data: roomId, error } = await supabase.rpc('create_poker_room', {
          p_name: `[Bluff] ${cleanBluffName}`,
          p_code: generatedCode,
          p_max_players: bluffMaxPlayers,
          p_starting_stack: 1000,
          p_small_blind: 0,
          p_big_blind: 0,
          p_turn_time: bluffChallengeTime,
          p_host_username: user?.username || 'Host'
        });

        if (error) {
          setErrorMsg('Failed to create bluff room: ' + error.message);
          isCreatingRef.current = false;
          setCreatingTable(false);
          return;
        }

        onJoinGame({
          roomId: roomId || generatedCode,
          roomCode: generatedCode,
          roomName: cleanBluffName,
          gameType: 'bluff',
          deckType: bluffDeckType,
          challengeTime: bluffChallengeTime,
          challengeRule: bluffChallengeRule,
          passAllowed: bluffPassAllowed,
          maxPlayers: bluffMaxPlayers,
          isPractice: false,
          hostUsername: user?.username || 'Host',
          isHost: true
        });
      } catch (err) {
        console.warn('Fallback bluff room creation:', err);
        const localCode = 'BL-' + Math.floor(1000 + Math.random() * 9000);
        onJoinGame({
          roomId: localCode,
          roomCode: localCode,
          roomName: cleanBluffName,
          gameType: 'bluff',
          deckType: bluffDeckType,
          challengeTime: bluffChallengeTime,
          challengeRule: bluffChallengeRule,
          passAllowed: bluffPassAllowed,
          maxPlayers: bluffMaxPlayers,
          isPractice: false,
          hostUsername: user?.username || 'Host',
          isHost: true
        });
      } finally {
        isCreatingRef.current = false;
        setCreatingTable(false);
      }
      return;
    }

    // --- Texas Hold'em Room Creation ---
    const cleanTableName = (tableName || '').trim() || 'Championship Ring';

    try {
      const generatedCode = 'PK-' + Math.floor(1000 + Math.random() * 9000);
      const { data: roomId, error } = await supabase.rpc('create_poker_room', {
        p_name: cleanTableName,
        p_code: generatedCode,
        p_max_players: maxPlayers,
        p_starting_stack: startingStack,
        p_small_blind: smallBlind,
        p_big_blind: bigBlind,
        p_turn_time: turnTime,
        p_host_username: user?.username || 'Host'
      });

      if (error) {
        setErrorMsg('Failed to create room: ' + error.message);
        isCreatingRef.current = false;
        setCreatingTable(false);
        return;
      }

      onJoinGame({
        roomId: roomId || generatedCode,
        roomCode: generatedCode,
        roomName: cleanTableName,
        gameType: 'poker',
        isPractice: false,
        hostUsername: user?.username || 'Host',
        isHost: true,
        maxPlayers,
        startingStack,
        smallBlind,
        bigBlind,
        turnTime,
        gameEnd,
        blindsFrequency,
        allInMinRaiseException,
        showRemainingRiverCards
      });
    } catch (err) {
      console.warn('Fallback room creation:', err);
      // Local fallback room
      const localCode = 'PK-' + Math.floor(1000 + Math.random() * 9000);
      onJoinGame({
        roomId: localCode,
        roomCode: localCode,
        roomName: cleanTableName,
        gameType: 'poker',
        isPractice: false,
        maxPlayers,
        startingStack,
        smallBlind,
        bigBlind,
        turnTime,
        gameEnd,
        blindsFrequency,
        allInMinRaiseException,
        showRemainingRiverCards
      });
    } finally {
      isCreatingRef.current = false;
      setCreatingTable(false);
    }
  };

  // Handle Join by Code (Works for PK-xxxx and BL-xxxx)
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) return;

    try {
      const { data, error } = await supabase
        .from('poker_rooms')
        .select('*')
        .eq('code', cleanCode)
        .single();

      if (error || !data) {
        setErrorMsg(`Room with code "${cleanCode}" not found.`);
        return;
      }

      const isBluffCode = data.code?.startsWith('BL-') || data.name?.toLowerCase().includes('bluff');

      onJoinGame({
        roomId: data.id,
        roomCode: data.code,
        roomName: data.name,
        gameType: isBluffCode ? 'bluff' : 'poker',
        deckType: isBluffCode ? 'single' : undefined,
        challengeTime: isBluffCode ? (data.turn_time_seconds || 8) : undefined,
        passAllowed: true,
        isPractice: false,
        maxPlayers: data.max_players || 6,
        startingStack: data.starting_stack || 1500,
        smallBlind: data.small_blind || 10,
        bigBlind: data.big_blind || 20,
        turnTime: data.turn_time_seconds || 120
      });
    } catch (err) {
      setErrorMsg('Error connecting to table: ' + err.message);
    }
  };

  // Handle Start Hold'em Practice Mode
  const handleStartPractice = () => {
    onJoinGame({
      roomId: 'practice_local',
      roomCode: 'SOLO-BOTS',
      roomName: 'Solo Training Ring',
      gameType: 'poker',
      isPractice: true,
      maxPlayers: practiceSeats,
      startingStack: startingStack || 1500,
      smallBlind: 10,
      bigBlind: 20,
      turnTime: 20,
      gameEnd,
      blindsFrequency,
      allInMinRaiseException,
      showRemainingRiverCards
    });
  };

  // Handle Start Bluff Master Practice Mode
  const handleStartBluffPractice = () => {
    onJoinGame({
      roomId: 'bluff_practice_local',
      roomCode: 'BL-SOLO',
      roomName: 'Solo Bluff Arena',
      gameType: 'bluff',
      deckType: bluffDeckType,
      challengeTime: bluffChallengeTime,
      challengeRule: bluffChallengeRule,
      passAllowed: bluffPassAllowed,
      isPractice: true,
      maxPlayers: bluffPracticeSeats,
      isHost: true
    });
  };

  return (
    <div className="lobby-wrapper">
      {/* Top Header */}
      <header className="lobby-nav">
        <div className="lobby-brand">
          <div className="lobby-brand-logo">♠</div>
          <div>
            <h1 className="lobby-brand-name">POKERMASTER</h1>
            <span className="lobby-brand-sub">Ring Games (3–8 Players)</span>
          </div>
        </div>

        {/* User Badge & Actions -> Theme Toggle & Online presence */}
        <div className="lobby-user-bar">
          {onToggleTheme && (
            <button
              onClick={() => onToggleTheme()}
              className="theme-toggle-header-btn"
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon className="w-4 h-4 text-slate-700" /> : <Sun className="w-4 h-4 text-amber-400" />}
            </button>
          )}

          {onOpenSocial && (
            <button
              onClick={onOpenSocial}
              className="social-toggle-btn"
              title="Online Players & Friends"
            >
              <span className="social-toggle-dot" />
              <span>Online ({onlineCount})</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="lobby-main">
        {/* Game Mode Selector Banner */}
        <div className="game-mode-banner">
          <div className="game-mode-banner-header">
            <div className="game-mode-banner-badge">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>SELECT GAME ARENA</span>
            </div>
            <span className="game-mode-banner-subtitle">
              Choose between No-Limit Texas Hold'em and Bluff Master (Cheat / I Doubt It)
            </span>
          </div>
          <div className="game-mode-cards-grid">
            {/* Card 1: Texas Hold'em */}
            <button
              type="button"
              onClick={() => handleSelectGameMode('poker')}
              className={`game-mode-card ${selectedGameMode === 'poker' ? 'active-poker' : ''}`}
            >
              <div className="game-mode-icon poker-icon">♠</div>
              <div className="game-mode-meta">
                <div className="game-mode-title-row">
                  <span className="game-mode-title">Texas Hold'em</span>
                  {selectedGameMode === 'poker' && (
                    <span className="game-mode-status-tag poker-tag">SELECTED</span>
                  )}
                </div>
                <span className="game-mode-description">
                  Ring Games • 3–8 Players • Blinds 2/4 • Hole Cards & Board
                </span>
              </div>
            </button>

            {/* Card 2: Bluff Master */}
            <button
              type="button"
              onClick={() => handleSelectGameMode('bluff')}
              className={`game-mode-card ${selectedGameMode === 'bluff' ? 'active-bluff' : ''}`}
            >
              <div className="game-mode-icon bluff-icon">🎭</div>
              <div className="game-mode-meta">
                <div className="game-mode-title-row">
                  <span className="game-mode-title">Bluff Master</span>
                  <span className="game-mode-new-pill">NEW</span>
                  {selectedGameMode === 'bluff' && (
                    <span className="game-mode-status-tag bluff-tag">SELECTED</span>
                  )}
                </div>
                <span className="game-mode-description">
                  Cheat / I Doubt It • 2–8 Players • 1 or 2 Decks • Jokers Wild
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="lobby-tabs-container">
          <button
            onClick={() => { setActiveTab('browse'); setErrorMsg(null); }}
            className={`lobby-tab-button ${activeTab === 'browse' ? 'active' : ''}`}
          >
            <Users className="w-4 h-4" />
            <span>Active Tables ({rooms.length})</span>
          </button>

          <button
            onClick={() => { setActiveTab('create'); setErrorMsg(null); }}
            className={`lobby-tab-button ${activeTab === 'create' ? 'active' : ''}`}
          >
            <Plus className="w-4 h-4" />
            <span>Create Table</span>
          </button>

          <button
            onClick={() => { setActiveTab('join'); setErrorMsg(null); }}
            className={`lobby-tab-button ${activeTab === 'join' ? 'active' : ''}`}
          >
            <LogIn className="w-4 h-4" />
            <span>Join with Code</span>
          </button>

          <button
            onClick={() => { setActiveTab('practice'); setErrorMsg(null); }}
            className={`lobby-tab-button ${activeTab === 'practice' ? 'active' : ''}`}
          >
            <Bot className="w-4 h-4" />
            <span>Practice / AI</span>
          </button>

          <button
            onClick={() => { setActiveTab('profile'); setErrorMsg(null); }}
            className={`lobby-tab-button ${activeTab === 'profile' ? 'active' : ''}`}
          >
            <User className="w-4 h-4" />
            <span>Profile</span>
          </button>
        </div>

        {errorMsg && (
          <div className="lobby-alert-box">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TAB 1: BROWSE TABLES */}
        {activeTab === 'browse' && (
          <section className="lobby-section">
            <div className="lobby-section-header">
              <div>
                <h2 className="lobby-section-title">Public Game Tables</h2>
                <p className="lobby-section-desc">Join an active table or create your own custom room</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {rooms.some((r) => (r.player_count || 0) === 0 && (!r.host_username || r.host_username === user?.username)) && (
                  <button
                    onClick={handleCleanEmptyRooms}
                    className="lobby-refresh-btn"
                    style={{ borderColor: '#ef4444', color: '#f87171' }}
                    title="Close your empty tables"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clean My Empty ({rooms.filter((r) => (r.player_count || 0) === 0 && (!r.host_username || r.host_username === user?.username)).length})</span>
                  </button>
                )}
                <button
                  onClick={fetchRooms}
                  className="lobby-refresh-btn"
                  title="Refresh Table List"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingRooms ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Game Type Filter Pills */}
            <div className="lobby-filter-pills">
              <button
                type="button"
                onClick={() => setTableFilter('all')}
                className={`lobby-filter-pill ${tableFilter === 'all' ? 'active' : ''}`}
              >
                <span>All Tables ({rooms.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('poker')}
                className={`lobby-filter-pill ${tableFilter === 'poker' ? 'active' : ''}`}
              >
                <span>♠ Texas Hold'em ({rooms.filter(r => !r.code?.startsWith('BL-') && !r.name?.toLowerCase().includes('bluff')).length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTableFilter('bluff')}
                className={`lobby-filter-pill ${tableFilter === 'bluff' ? 'active' : ''}`}
              >
                <span>🎭 Bluff Master ({rooms.filter(r => r.code?.startsWith('BL-') || r.name?.toLowerCase().includes('bluff')).length})</span>
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="lobby-empty-card">
                <Layers className="w-10 h-10 text-slate-400 mb-3" />
                <h3 className="lobby-empty-title">No Active Tables</h3>
                <p className="lobby-empty-desc">
                  There are no open tables currently. Be the first to create a table and invite your friends!
                </p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="lobby-primary-action-btn"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Game Table</span>
                </button>
              </div>
            ) : (
              <div className="lobby-rooms-grid">
                {rooms
                  .filter((r) => {
                    const isBluff = r.code?.startsWith('BL-') || r.name?.toLowerCase().includes('bluff');
                    if (tableFilter === 'poker') return !isBluff;
                    if (tableFilter === 'bluff') return isBluff;
                    return true;
                  })
                  .map((r) => {
                    const isBluff = r.code?.startsWith('BL-') || r.name?.toLowerCase().includes('bluff');
                    return (
                      <div key={r.id || r.code} className="lobby-room-card">
                        <div className="lobby-room-card-header">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                              <span className={`lobby-game-chip ${isBluff ? 'bluff' : 'poker'}`}>
                                {isBluff ? '🎭 Bluff' : '♠ Hold\'em'}
                              </span>
                              <h4 className="lobby-room-name">{r.name}</h4>
                            </div>
                            <span className="lobby-room-code">Code: {r.code} • Host: {r.host_username || 'Host'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className={`lobby-room-status-badge ${(r.player_count || 0) > 0 ? (r.status === 'in_progress' ? 'live' : 'waiting') : 'empty'}`}>
                              {(r.player_count || 0) > 0
                                ? (r.status === 'in_progress' ? 'Live Hand' : 'Open Seats')
                                : 'Empty'}
                            </span>
                            {/* Only table creator can delete table, and ONLY when 0 active players are seated */}
                            {(!r.host_username || r.host_username === user?.username) && (r.player_count || 0) === 0 && (
                              <button
                                onClick={(e) => handleCloseRoom(r, e)}
                                className="lobby-room-delete-btn"
                                title="Close / Delete Table (Creator only)"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isBluff ? (
                          <div className="lobby-room-stats">
                            <div className="lobby-stat-item">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>Seats: {r.player_count ?? 0} / {r.max_players || 6}</span>
                            </div>
                            <div className="lobby-stat-item">
                              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                              <span>Rules: Jokers Wild</span>
                            </div>
                          </div>
                        ) : (
                          <div className="lobby-room-stats">
                            <div className="lobby-stat-item">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              <span>Seats: {r.player_count ?? 0} / {r.max_players || 6}</span>
                            </div>
                            <div className="lobby-stat-item">
                              <Coins className="w-3.5 h-3.5 text-amber-400" />
                              <span>Blinds: {formatPoints(r.small_blind || 10)} / {formatPoints(r.big_blind || 20)}</span>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => onJoinGame({
                            roomId: r.id,
                            roomCode: r.code,
                            roomName: r.name,
                            gameType: isBluff ? 'bluff' : 'poker',
                            deckType: isBluff ? 'single' : undefined,
                            challengeTime: isBluff ? (r.turn_time_seconds || 8) : undefined,
                            passAllowed: true,
                            isPractice: false,
                            maxPlayers: r.max_players || 6,
                            startingStack: r.starting_stack || 1000,
                            smallBlind: r.small_blind || 2,
                            bigBlind: r.big_blind || 4,
                            turnTime: r.turn_time_seconds || 0
                          })}
                          className="lobby-room-join-btn"
                        >
                          <span>Join Table</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: CREATE TABLE */}
        {activeTab === 'create' && (
          <section className="lobby-section max-w-xl mx-auto">
            <div className="lobby-card-box">
              {/* Form Mode Selector */}
              <div className="create-mode-switch-row">
                <button
                  type="button"
                  onClick={() => handleSelectGameMode('poker')}
                  className={`create-mode-switch-btn ${selectedGameMode === 'poker' ? 'active-poker' : ''}`}
                >
                  <span>♠ Texas Hold'em</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectGameMode('bluff')}
                  className={`create-mode-switch-btn ${selectedGameMode === 'bluff' ? 'active-bluff' : ''}`}
                >
                  <span>🎭 Bluff Master</span>
                  <span className="create-mode-new-chip">NEW</span>
                </button>
              </div>

              {selectedGameMode === 'bluff' ? (
                /* --- BLUFF MASTER FORM --- */
                <div>
                  <h2 className="lobby-section-title mb-1">Create Bluff Master Table</h2>
                  <p className="lobby-section-desc mb-5">
                    Classic Cheat / I Doubt It • 2–8 Players • Play cards face-down and claim rank ladder!
                  </p>

                  <form onSubmit={handleCreateTable} className="space-y-4">
                    <div>
                      <label className="lobby-form-label">Table Name</label>
                      <input
                        type="text"
                        value={bluffTableName}
                        onChange={(e) => setBluffTableName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                        maxLength={30}
                        required
                        className="lobby-form-input"
                        placeholder="e.g. Royal Bluffers"
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label className="lobby-form-label" style={{ margin: 0 }}>Table Capacity</label>
                        <span className="table-badge-capacity">
                          {bluffMaxPlayers} Max Players
                        </span>
                      </div>
                      <div className="table-capacity-grid">
                        {[2, 3, 4, 5, 6, 7, 8].map((seats) => (
                          <button
                            key={seats}
                            type="button"
                            onClick={() => setBluffMaxPlayers(seats)}
                            className={`table-capacity-pill ${bluffMaxPlayers === seats ? 'active' : ''}`}
                          >
                            <span className="capacity-pill-number">{seats}</span>
                            <span className="capacity-pill-label">
                              {seats === 2 ? 'Heads-up' : seats === 6 ? '6-Max' : seats === 8 ? '8-Max' : `${seats} Seats`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="lobby-form-label">Deck Configuration</label>
                      <div className="bluff-deck-grid">
                        <button
                          type="button"
                          onClick={() => setBluffDeckType('single')}
                          className={`bluff-deck-card ${bluffDeckType === 'single' ? 'active' : ''}`}
                        >
                          <div className="deck-card-icon">🃏</div>
                          <div className="deck-card-meta">
                            <span className="deck-card-title">Single Deck (54 Cards)</span>
                            <span className="deck-card-desc">52 standard cards + 2 wild Jokers (1 Red, 1 Black). Ideal for 2–4 players.</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBluffDeckType('double')}
                          className={`bluff-deck-card ${bluffDeckType === 'double' ? 'active' : ''}`}
                        >
                          <div className="deck-card-icon">🃏🃏</div>
                          <div className="deck-card-meta">
                            <span className="deck-card-title">Double Deck (108 Cards)</span>
                            <span className="deck-card-desc">104 standard cards + 4 wild Jokers (2 Red, 2 Black). Ideal for 5–8 players.</span>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label className="lobby-form-label" style={{ margin: 0 }}>Challenge Window Timer</label>
                        <span className="table-badge-shotclock">
                          {bluffChallengeTime === 0 ? '∞ No Limit' : `${bluffChallengeTime}s`} to Call Bluff
                        </span>
                      </div>
                      <div className="shot-clock-grid">
                        {[
                          { sec: 5, label: '5s', desc: 'Blitz' },
                          { sec: 8, label: '8s', desc: 'Fast' },
                          { sec: 10, label: '10s', desc: 'Normal' },
                          { sec: 15, label: '15s', desc: 'Deliberate' },
                          { sec: 0, label: '∞', desc: 'No Limit' }
                        ].map(({ sec, label, desc }) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setBluffChallengeTime(sec)}
                            className={`shot-clock-pill ${bluffChallengeTime === sec ? 'active' : ''}`}
                          >
                            <span className="shot-clock-time">{label}</span>
                            <span className="shot-clock-desc">{desc}</span>
                          </button>
                        ))}
                      </div>
                      <span className="lobby-field-desc" style={{ marginTop: '6px' }}>
                        Time window for other players to shout "BLUFF!" after a card play
                      </span>
                    </div>

                    {/* Challenge Rule Mode (Anyone Can Call vs Next Person Only) */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label className="lobby-form-label" style={{ margin: 0 }}>Challenge Rule Mode</label>
                        <span className="table-badge-shotclock">
                          {bluffChallengeRule === 'anyone' ? '⚡ Anyone Can Call' : '👉 Next Person Only'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setBluffChallengeRule('anyone')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            bluffChallengeRule === 'anyone'
                              ? 'bg-purple-950/50 border-purple-500 text-purple-200 shadow-lg shadow-purple-900/30'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
                            <span>⚡ Anyone Can Call</span>
                          </div>
                          <span className="text-[11px] text-slate-400 leading-tight block">
                            Free-for-all: Any seated player can call bluff during the reaction timer.
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBluffChallengeRule('next_only')}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            bluffChallengeRule === 'next_only'
                              ? 'bg-purple-950/50 border-purple-500 text-purple-200 shadow-lg shadow-purple-900/30'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
                            <span>👉 Next Person Only</span>
                          </div>
                          <span className="text-[11px] text-slate-400 leading-tight block">
                            Strict turn rotation: Only the immediate next player challenges or accepts & plays!
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Pass Allowed Toggle */}
                    <div className="custom-toggle-card">
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={bluffPassAllowed}
                          onChange={(e) => setBluffPassAllowed(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: '#a855f7', marginTop: '2px', cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <span className="custom-toggle-title">Passing Allowed</span>
                          <p className="custom-option-desc" style={{ marginTop: '4px' }}>
                            {bluffPassAllowed
                              ? 'Players can pass their turn without playing any cards if they do not hold matching rank.'
                              : 'Mandatory Play: Every player MUST play 1 to 4 cards on their turn, forcing strategic bluffs!'}
                          </p>
                        </div>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={creatingTable}
                      className="lobby-submit-action-btn bluff-submit-btn"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{creatingTable ? 'Creating Bluff Room...' : 'CREATE BLUFF TABLE & ENTER'}</span>
                    </button>
                  </form>
                </div>
              ) : (
                /* --- TEXAS HOLD'EM FORM --- */
                <div>
                  <h2 className="lobby-section-title mb-1">Create Texas Hold'em Table</h2>
                  <p className="lobby-section-desc mb-5">Set your ring game rules and invite other players</p>

                  <form onSubmit={handleCreateTable} className="space-y-4">
                    <div>
                      <label className="lobby-form-label">Table Name</label>
                      <input
                        type="text"
                        value={tableName}
                        onChange={(e) => setTableName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                        maxLength={30}
                        required
                        className="lobby-form-input"
                        placeholder="e.g. High Rollers"
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label className="lobby-form-label" style={{ margin: 0 }}>Table Capacity</label>
                        <span className="table-badge-capacity">
                          {maxPlayers} Max Players
                        </span>
                      </div>
                      <div className="table-capacity-grid">
                        {[3, 4, 5, 6, 7, 8].map((seats) => (
                          <button
                            key={seats}
                            type="button"
                            onClick={() => setMaxPlayers(seats)}
                            className={`table-capacity-pill ${maxPlayers === seats ? 'active' : ''}`}
                          >
                            <span className="capacity-pill-number">{seats}</span>
                            <span className="capacity-pill-label">
                              {seats === 3 ? '3-Max' : seats === 6 ? '6-Max' : seats === 8 ? '8-Ring' : `${seats} Seats`}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="create-table-grid">
                      <div>
                        <label className="lobby-form-label">Blinds Schedule</label>
                        <select
                          value={`${smallBlind}/${bigBlind}`}
                          onChange={(e) => {
                            const [sb, bb] = e.target.value.split('/').map(Number);
                            setSmallBlind(sb);
                            setBigBlind(bb);
                          }}
                          className="lobby-form-select"
                        >
                          <option value="2/4">{formatPoints(2)} / {formatPoints(4)} (Default • 2/4 Micro)</option>
                          <option value="1/2">{formatPoints(1)} / {formatPoints(2)} (Micro • 1, 2, 4, 8, 16...)</option>
                          <option value="5/10">{formatPoints(5)} / {formatPoints(10)} (Low Stakes)</option>
                          <option value="10/20">{formatPoints(10)} / {formatPoints(20)} (Standard 10/20)</option>
                          <option value="25/50">{formatPoints(25)} / {formatPoints(50)} (Mid Stakes)</option>
                          <option value="50/100">{formatPoints(50)} / {formatPoints(100)} (High Stakes)</option>
                          <option value="100/200">{formatPoints(100)} / {formatPoints(200)} (High Roller)</option>
                          <option value="250/500">{formatPoints(250)} / {formatPoints(500)} (Championship)</option>
                        </select>
                        <span className="lobby-field-desc">
                          Initial Small / Big blind per hand
                        </span>
                      </div>

                      <div>
                        <label className="lobby-form-label">Starting Stack</label>
                        <select
                          value={startingStack}
                          onChange={(e) => setStartingStack(Number(e.target.value))}
                          className="lobby-form-select"
                        >
                          <option value={1000}>{formatPoints(1000)} (Default Stack)</option>
                          <option value={100}>{formatPoints(100)} (Micro Stack)</option>
                          <option value={250}>{formatPoints(250)} (Short Stack)</option>
                          <option value={500}>{formatPoints(500)} (Medium Stack)</option>
                          <option value={1500}>{formatPoints(1500)} (Deep 75BB)</option>
                          <option value={2500}>{formatPoints(2500)} (Pro Stack)</option>
                          <option value={5000}>{formatPoints(5000)} (High Roller)</option>
                          <option value={10000}>{formatPoints(10000)} (Championship)</option>
                        </select>
                        <span className="lobby-field-desc">
                          Initial chips per seated player
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label className="lobby-form-label" style={{ margin: 0 }}>Shot Clock (Turn Timer)</label>
                        <span className="table-badge-shotclock">
                          {turnTime === 0 ? '∞ No Limit' : turnTime >= 60 ? `${turnTime / 60} Min` : `${turnTime}s`} per turn
                        </span>
                      </div>
                      <div className="shot-clock-grid">
                        {[
                          { sec: 0, label: '∞', desc: 'No Limit' },
                          { sec: 30, label: '30s', desc: 'Blitz' },
                          { sec: 60, label: '1m', desc: 'Quick' },
                          { sec: 90, label: '1.5m', desc: 'Normal' },
                          { sec: 120, label: '2m', desc: 'Default' },
                          { sec: 180, label: '3m', desc: 'Deep' }
                        ].map(({ sec, label, desc }) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setTurnTime(sec)}
                            className={`shot-clock-pill ${turnTime === sec ? 'active' : ''}`}
                          >
                            <span className="shot-clock-time">{label}</span>
                            <span className="shot-clock-desc">{desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Options Accordion (matching user screenshot) */}
                    <div className="custom-options-container">
                      <button
                        type="button"
                        onClick={() => setCustomOptionsOpen(!customOptionsOpen)}
                        className="custom-options-header"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {customOptionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          <span className="custom-options-title">Custom options</span>
                        </div>
                        <span className="custom-options-plus">+</span>
                      </button>

                      {customOptionsOpen && (
                        <div className="custom-options-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Game end */}
                          <div className="custom-option-item">
                            <label className="custom-option-label">Game end</label>
                            <div className="custom-select-row">
                              <select
                                value={gameEnd}
                                onChange={(e) => setGameEnd(e.target.value)}
                                className="custom-option-select"
                              >
                                <option value="winner_takes_all">Winner takes all</option>
                                <option value="chips_limit">Chips limit (5,000 PTS)</option>
                                <option value="hand_limit">Hand limit (25 hands)</option>
                              </select>
                              <button type="button" className="custom-shuffle-btn" title="Option selected">
                                <Shuffle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Blinds increase frequency */}
                          <div className="custom-option-item">
                            <label className="custom-option-label">Blinds increase frequency</label>
                            <div className="custom-select-row">
                              <select
                                value={blindsFrequency}
                                onChange={(e) => setBlindsFrequency(e.target.value)}
                                className="custom-option-select"
                              >
                                <option value="hyper_2">Hyper-Turbo • Every 2 hands (Doubles: 2, 4, 8, 16, 32...)</option>
                                <option value="fast_5">Fast • Every 5 hands</option>
                                <option value="standard_10">Standard • Every 10 hands</option>
                                <option value="slow_15">Slow • Every 15 hands</option>
                                <option value="never">Fixed Blinds (No escalation)</option>
                              </select>
                              <button type="button" className="custom-shuffle-btn" title="Option selected">
                                <Shuffle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="custom-option-desc">
                              {blindsFrequency === 'hyper_2'
                                ? `Blinds start at ${smallBlind}/${bigBlind} and double every 2 hands (e.g. ${smallBlind * 2}/${bigBlind * 2} on Hand 3, ${smallBlind * 4}/${bigBlind * 4} on Hand 5, ${smallBlind * 8}/${bigBlind * 8} on Hand 7...)`
                                : blindsFrequency === 'fast_5'
                                ? `Blinds start at ${smallBlind}/${bigBlind} and double every 5 hands or when a player is eliminated`
                                : blindsFrequency === 'standard_10'
                                ? `Blinds start at ${smallBlind}/${bigBlind} and double every 10 hands`
                                : blindsFrequency === 'slow_15'
                                ? 'Tournament structure: blinds double every 15 hands'
                                : 'Blinds remain constant throughout all hands'}
                            </p>
                          </div>

                          {/* Initial amount of chips / Starting Stack Sync */}
                          <div className="custom-option-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label className="custom-option-label" style={{ margin: 0 }}>Starting Stack (Initial Chips)</label>
                              <span className="custom-option-badge">
                                {formatPoints(startingStack)}
                              </span>
                            </div>
                            <p className="custom-option-desc">
                              Configured above. Every seated player receives a total starting value of {formatPoints(startingStack)} upon joining.
                            </p>
                          </div>

                          {/* All in minimum raise exception */}
                          <div className="custom-toggle-card">
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={allInMinRaiseException}
                                onChange={(e) => setAllInMinRaiseException(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#10b981', marginTop: '2px', cursor: 'pointer' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span className="custom-toggle-title">
                                    All in minimum raise exception
                                  </span>
                                  <button type="button" className="custom-shuffle-btn" style={{ width: '28px', height: '28px' }} title="Toggle">
                                    <Shuffle className="w-3 h-3" />
                                  </button>
                                </div>
                                <p className="custom-option-desc" style={{ marginTop: '4px' }}>
                                  The All In action is NOT subject to the minimum raise amount rule. Players can go all in to raise a bet even if they don't have enough chips to raise by the current minimum bet or raise amount.
                                </p>
                              </div>
                            </label>
                          </div>

                          {/* Show remaining river cards */}
                          <div className="custom-toggle-card">
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={showRemainingRiverCards}
                                onChange={(e) => setShowRemainingRiverCards(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#10b981', marginTop: '2px', cursor: 'pointer' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span className="custom-toggle-title">
                                    Show remaining river cards
                                  </span>
                                  <button type="button" className="custom-shuffle-btn" style={{ width: '28px', height: '28px' }} title="Toggle">
                                    <Shuffle className="w-3 h-3" />
                                  </button>
                                </div>
                                <p className="custom-option-desc" style={{ marginTop: '4px' }}>
                                  {showRemainingRiverCards
                                    ? 'Remaining community cards will be revealed if all players fold early.'
                                    : 'Regular rule: if all players but one have folded, the remaining river cards are not revealed.'}
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={creatingTable}
                      className="lobby-submit-action-btn"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{creatingTable ? 'Creating Room...' : 'CREATE TABLE & ENTER'}</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: JOIN TABLE WITH CODE */}
        {activeTab === 'join' && (
          <section className="lobby-section max-w-md mx-auto">
            <div className="lobby-card-box text-center">
              <h2 className="lobby-section-title mb-1">Join with Room Code</h2>
              <p className="lobby-section-desc mb-5">Enter the room code shared by your host (PK-xxxx or BL-xxxx)</p>

              <form onSubmit={handleJoinByCode} className="space-y-4">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PK-8821 or BL-4029"
                  className="lobby-code-input"
                  maxLength={12}
                  required
                />

                <button type="submit" className="lobby-submit-action-btn">
                  <LogIn className="w-4 h-4" />
                  <span>JOIN TABLE</span>
                </button>
              </form>
            </div>
          </section>
        )}

        {/* TAB 4: PRACTICE WITH BOTS */}
        {activeTab === 'practice' && (
          <section className="lobby-section max-w-md mx-auto">
            <div className="lobby-card-box">
              {/* Practice Mode Switcher */}
              <div className="create-mode-switch-row">
                <button
                  type="button"
                  onClick={() => handleSelectGameMode('poker')}
                  className={`create-mode-switch-btn ${selectedGameMode === 'poker' ? 'active-poker' : ''}`}
                >
                  <span>♠ Hold'em Arena</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectGameMode('bluff')}
                  className={`create-mode-switch-btn ${selectedGameMode === 'bluff' ? 'active-bluff' : ''}`}
                >
                  <span>🎭 Bluff Arena</span>
                  <span className="create-mode-new-chip">NEW</span>
                </button>
              </div>

              {selectedGameMode === 'bluff' ? (
                /* --- BLUFF MASTER PRACTICE --- */
                <div>
                  <div className="flex items-center space-x-2 text-purple-400 mb-1">
                    <Sparkles className="w-5 h-5" />
                    <h2 className="lobby-section-title">Solo Bluff Practice Arena</h2>
                  </div>
                  <p className="lobby-section-desc mb-5">
                    Practice Bluff (Cheat / I Doubt It) against AI bots with strategic bluffing and probabilistic challenge logic.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="lobby-form-label">Table Size</label>
                        <span className="text-xs font-bold text-purple-400">{bluffPracticeSeats} Players</span>
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={8}
                        value={bluffPracticeSeats}
                        onChange={(e) => setBluffPracticeSeats(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>2 Players</span>
                        <span>5 Standard</span>
                        <span>8 Full Ring</span>
                      </div>
                    </div>

                    <div>
                      <label className="lobby-form-label">Deck Configuration</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setBluffDeckType('single')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            bluffDeckType === 'single'
                              ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-900/30'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white flex items-center gap-1">
                            <span>🃏 Single Deck</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">54 Cards (2 Jokers)</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBluffDeckType('double')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            bluffDeckType === 'double'
                              ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-900/30'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white flex items-center gap-1">
                            <span>🃏🃏 Double Deck</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">108 Cards (4 Jokers)</div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="lobby-form-label">Challenge Rule Mode</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setBluffChallengeRule('anyone')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            bluffChallengeRule === 'anyone'
                              ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-900/30'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white flex items-center gap-1">
                            <span>⚡ Anyone Can Call</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Free-for-all challenge window</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBluffChallengeRule('next_only')}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            bluffChallengeRule === 'next_only'
                              ? 'bg-purple-950/40 border-purple-500 text-purple-200 shadow-md shadow-purple-900/30'
                              : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="text-xs font-bold text-white flex items-center gap-1">
                            <span>👉 Next Person Only</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Strict clockwise rotation</div>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-800/40 text-xs text-purple-200 space-y-1.5">
                      <div className="flex items-center space-x-2 text-purple-300 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                        <span>Realistic Bluff AI Heuristics</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Bots follow rank rules (A → 2 → ... → K → A), execute wild Joker substitutions, bluff when necessary, and challenge suspicious claims!
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartBluffPractice}
                      className="lobby-practice-action-btn bluff-practice-btn"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>START BLUFF PRACTICE</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* --- TEXAS HOLD'EM PRACTICE --- */
                <div>
                  <div className="flex items-center space-x-2 text-emerald-400 mb-1">
                    <Bot className="w-5 h-5" />
                    <h2 className="lobby-section-title">Solo Hold'em Arena</h2>
                  </div>
                  <p className="lobby-section-desc mb-5">
                    Practice Texas Hold'em against intelligent simulation bots with instant dealt hands and zero waiting.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="lobby-form-label">Table Size</label>
                        <span className="text-xs font-bold text-emerald-400">{practiceSeats} Seats</span>
                      </div>
                      <input
                        type="range"
                        min={3}
                        max={8}
                        value={practiceSeats}
                        onChange={(e) => setPracticeSeats(Number(e.target.value))}
                        className="w-full accent-emerald-400 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>3 Players</span>
                        <span>6-Max</span>
                        <span>8 Full Ring</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1.5">
                      <div className="flex items-center space-x-2 text-emerald-300 font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Realistic Bot Decision Engine</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Bots fold, call, bet, and raise based on pot odds and hand rankings. Perfect for warming up or testing bankroll strategies!
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartPractice}
                      className="lobby-practice-action-btn"
                    >
                      <Bot className="w-4 h-4" />
                      <span>START PRACTICE GAME</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 5: PLAYER PROFILE */}
        {activeTab === 'profile' && (
          <section className="lobby-section max-w-lg mx-auto">
            <div className="profile-container-card">
              {/* Profile Header Title */}
              <div className="profile-header-meta">
                <h2 className="lobby-section-title">Player Profile</h2>
                <p className="lobby-section-desc">
                  Your poker account details, chips balance, and session control
                </p>
              </div>

              {/* User Hero Banner */}
              <div className="profile-hero-banner">
                <div className="profile-avatar-large">
                  {user.username ? user.username.slice(0, 2).toUpperCase() : 'P'}
                </div>
                <div className="profile-hero-info">
                  <div className="profile-username-row">
                    <h3 className="profile-username">{user.username}</h3>
                    <span className="profile-badge-verified">Verified</span>
                  </div>
                  <p className="profile-status-text">
                    <span className="profile-status-dot" />
                    <span>Online • Texas Hold'em Player</span>
                  </p>
                </div>
              </div>

              {/* Chips & Points Balance Card */}
              <div className="profile-chips-card">
                <div className="profile-chips-header">
                  <div className="profile-chips-icon-wrap">
                    <Coins className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <span className="profile-chips-label">Bankroll / Chips (PTS)</span>
                    <h4 className="profile-chips-val">{formatPoints(user.chips || 5000)}</h4>
                  </div>
                </div>
                <p className="profile-chips-note">
                  Virtual ring-game bankroll. Players receive standard starting stacks when seated at tables.
                </p>
              </div>

              {/* Account Details & Game Defaults */}
              <div className="profile-details-grid">
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Default Turn Time</span>
                  <span className="profile-detail-val">2 Minutes (120s)</span>
                </div>
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Table Preference</span>
                  <span className="profile-detail-val">Ring Games (3–8 Max)</span>
                </div>
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Current Status</span>
                  <span className="profile-detail-val text-emerald-400">Ready to Play</span>
                </div>
                <div className="profile-detail-item">
                  <span className="profile-detail-label">Audio & SFX</span>
                  <span className="profile-detail-val">Procedural WebAudio</span>
                </div>
              </div>

              {/* App Theme / Appearance Card */}
              <div className="profile-theme-card">
                <div className="profile-theme-header">
                  <div className="profile-theme-icon-wrap">
                    {theme === 'light' ? (
                      <Sun className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Moon className="w-5 h-5 text-indigo-400" />
                    )}
                  </div>
                  <div>
                    <span className="profile-theme-title">App Theme</span>
                    <p className="profile-theme-sub">
                      {theme === 'light' ? 'Luxury Light Mode' : 'Deep Casino Dark Mode'}
                    </p>
                  </div>
                </div>
                <div className="profile-theme-buttons">
                  <button
                    type="button"
                    onClick={() => onToggleTheme && onToggleTheme('dark')}
                    className={`profile-theme-btn ${theme !== 'light' ? 'active' : ''}`}
                  >
                    <Moon className="w-4 h-4" />
                    <span>Dark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTheme && onToggleTheme('light')}
                    className={`profile-theme-btn ${theme === 'light' ? 'active' : ''}`}
                  >
                    <Sun className="w-4 h-4" />
                    <span>Light</span>
                  </button>
                </div>
              </div>

              {/* Sign Out Action Button */}
              <div className="profile-actions-footer">
                <button
                  type="button"
                  onClick={onLogout}
                  className="profile-signout-btn"
                  title="Sign Out of Account"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out of Account</span>
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
