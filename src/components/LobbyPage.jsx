import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Plus,
  LogIn,
  Bot,
  Users,
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
  Trash2
} from 'lucide-react';

import { formatPoints, formatPointsOnly } from '../lib/formatters';

export const LobbyPage = ({
  user,
  onLogout,
  onJoinGame
}) => {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'create' | 'join' | 'practice'
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Create Table Form State
  const [tableName, setTableName] = useState('Championship Ring');
  const [maxPlayers, setMaxPlayers] = useState(6); // 3 to 8
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [startingStack, setStartingStack] = useState(1500);
  const [turnTime, setTurnTime] = useState(25);
  const [creatingTable, setCreatingTable] = useState(false);
  const isCreatingRef = useRef(false);

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

  // Close / Delete a Table
  const handleCloseRoom = async (roomId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to close and remove this table?')) return;
    try {
      await supabase
        .from('poker_rooms')
        .update({ status: 'closed' })
        .eq('id', roomId);
      fetchRooms();
    } catch (err) {
      console.warn('Error closing room:', err);
    }
  };

  // Clean all empty tables with 0 players
  const handleCleanEmptyRooms = async () => {
    const emptyRooms = rooms.filter((r) => (r.player_count || 0) === 0);
    if (emptyRooms.length === 0) {
      alert('No empty tables to clean up.');
      return;
    }
    try {
      const emptyIds = emptyRooms.map((r) => r.id);
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

  // Handle Create Room
  const handleCreateTable = async (e) => {
    if (e) e.preventDefault();
    if (isCreatingRef.current || creatingTable) return;
    isCreatingRef.current = true;
    setCreatingTable(true);
    setErrorMsg(null);

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
        p_turn_time: turnTime
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
    } catch (err) {
      console.warn('Fallback room creation:', err);
      // Local fallback room
      const localCode = 'PK-' + Math.floor(1000 + Math.random() * 9000);
      onJoinGame({
        roomId: localCode,
        roomCode: localCode,
        roomName: cleanTableName,
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

  // Handle Join by Code
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

      onJoinGame({
        roomId: data.id,
        roomCode: data.code,
        roomName: data.name,
        isPractice: false,
        maxPlayers: data.max_players || 6,
        startingStack: data.starting_stack || 1500,
        smallBlind: data.small_blind || 10,
        bigBlind: data.big_blind || 20,
        turnTime: data.turn_time_seconds || 25
      });
    } catch (err) {
      setErrorMsg('Error connecting to table: ' + err.message);
    }
  };

  // Handle Start Practice Mode
  const handleStartPractice = () => {
    onJoinGame({
      roomId: 'practice_local',
      roomCode: 'SOLO-BOTS',
      roomName: 'Solo Training Ring',
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

        {/* User Badge & Actions */}
        <div className="lobby-user-bar">
          <div className="lobby-user-card">
            <div className="lobby-user-avatar">
              {user.username ? user.username.slice(0, 2).toUpperCase() : 'P'}
            </div>
            <div className="lobby-user-info">
              <span className="lobby-user-name">{user.username}</span>
              <span className="lobby-user-chips">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span>{formatPoints(user.chips || 5000)}</span>
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="lobby-logout-btn"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="lobby-main">
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
                <h2 className="lobby-section-title">Public Poker Tables</h2>
                <p className="lobby-section-desc">Join an existing ring table or create your own</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {rooms.some((r) => (r.player_count || 0) === 0) && (
                  <button
                    onClick={handleCleanEmptyRooms}
                    className="lobby-refresh-btn"
                    style={{ borderColor: '#ef4444', color: '#f87171' }}
                    title="Close all empty tables"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clean Empty ({rooms.filter((r) => (r.player_count || 0) === 0).length})</span>
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

            {rooms.length === 0 ? (
              <div className="lobby-empty-card">
                <Layers className="w-10 h-10 text-slate-500 mb-3" />
                <h3 className="text-base font-bold text-white mb-1">No Active Tables</h3>
                <p className="text-xs text-slate-400 mb-4 max-w-sm">
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
                {rooms.map((r) => (
                  <div key={r.id || r.code} className="lobby-room-card">
                    <div className="lobby-room-card-header">
                      <div>
                        <h4 className="lobby-room-name">{r.name}</h4>
                        <span className="lobby-room-code">Code: {r.code}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`lobby-room-status-badge ${(r.player_count || 0) > 0 ? (r.status === 'in_progress' ? 'live' : 'waiting') : 'empty'}`}>
                          {(r.player_count || 0) > 0
                            ? (r.status === 'in_progress' ? 'Live Hand' : 'Open Seats')
                            : 'Empty'}
                        </span>
                        <button
                          onClick={(e) => handleCloseRoom(r.id, e)}
                          className="lobby-room-delete-btn"
                          title="Close / Delete Table"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
                        </button>
                      </div>
                    </div>

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

                    <button
                      onClick={() => onJoinGame({
                        roomId: r.id,
                        roomCode: r.code,
                        roomName: r.name,
                        isPractice: false,
                        maxPlayers: r.max_players || 6,
                        startingStack: r.starting_stack || 1500,
                        smallBlind: r.small_blind || 10,
                        bigBlind: r.big_blind || 20,
                        turnTime: r.turn_time_seconds || 25
                      })}
                      className="lobby-room-join-btn"
                    >
                      <span>Join Table</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: CREATE TABLE */}
        {activeTab === 'create' && (
          <section className="lobby-section max-w-xl mx-auto">
            <div className="lobby-card-box">
              <h2 className="lobby-section-title mb-1">Create New Table</h2>
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
                  <div className="flex justify-between items-center mb-1">
                    <label className="lobby-form-label">Table Capacity (3 to 8 Players)</label>
                    <span className="text-xs font-bold text-amber-400">{maxPlayers} Seats</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={8}
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>3 Players</span>
                    <span>6-Max Standard</span>
                    <span>8 Full Ring</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                      <option value="10/20">{formatPoints(10)} / {formatPoints(20)} (Standard)</option>
                      <option value="25/50">{formatPoints(25)} / {formatPoints(50)} (Mid Stakes)</option>
                      <option value="50/100">{formatPoints(50)} / {formatPoints(100)} (High Stakes)</option>
                    </select>
                  </div>

                  <div>
                    <label className="lobby-form-label">Starting Stack</label>
                    <select
                      value={startingStack}
                      onChange={(e) => setStartingStack(Number(e.target.value))}
                      className="lobby-form-select"
                    >
                      <option value={1000}>{formatPoints(1000)} (Turbo)</option>
                      <option value={1500}>{formatPoints(1500)} (Deep 75BB)</option>
                      <option value={3000}>{formatPoints(3000)} (Championship)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="lobby-form-label">Shot Clock (Seconds per turn)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[15, 25, 35].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setTurnTime(sec)}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          turnTime === sec
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {sec} Seconds
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
                      {customOptionsOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#f1f5f9' }}>Custom options</span>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '16px', fontWeight: 900 }}>+</span>
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
                            <option value="fast_5">Fast - every 5 hands</option>
                            <option value="standard_10">Standard - every 10 hands</option>
                            <option value="slow_15">Slow - every 15 hands</option>
                            <option value="never">No increase (Constant blinds)</option>
                          </select>
                          <button type="button" className="custom-shuffle-btn" title="Option selected">
                            <Shuffle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="custom-option-desc">
                          {blindsFrequency === 'fast_5'
                            ? 'Blinds start at 10/20 and double every 5 hands or when a player is eliminated'
                            : blindsFrequency === 'standard_10'
                            ? 'Blinds start at 10/20 and double every 10 hands'
                            : blindsFrequency === 'slow_15'
                            ? 'Tournament structure: blinds double every 15 hands'
                            : 'Blinds remain constant throughout all hands'}
                        </p>
                      </div>

                      {/* Initial amount of chips */}
                      <div className="custom-option-item">
                        <label className="custom-option-label">Initial amount of chips</label>
                        <div className="custom-select-row">
                          <select
                            value={startingStack}
                            onChange={(e) => setStartingStack(Number(e.target.value))}
                            className="custom-option-select"
                          >
                            <option value={1000}>1000 total value per player</option>
                            <option value={1500}>1500 total value per player</option>
                            <option value={3000}>3000 total value per player</option>
                            <option value={5000}>5000 total value per player</option>
                          </select>
                          <button type="button" className="custom-shuffle-btn" title="Option selected">
                            <Shuffle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="custom-option-desc">
                          Each player starts with a total chips value of {startingStack}.
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
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
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
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
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
          </section>
        )}

        {/* TAB 3: JOIN TABLE WITH CODE */}
        {activeTab === 'join' && (
          <section className="lobby-section max-w-md mx-auto">
            <div className="lobby-card-box text-center">
              <h2 className="lobby-section-title mb-1">Join with Room Code</h2>
              <p className="lobby-section-desc mb-5">Enter the room code shared by your host</p>

              <form onSubmit={handleJoinByCode} className="space-y-4">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PK-8821"
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
              <div className="flex items-center space-x-2 text-emerald-400 mb-1">
                <Bot className="w-5 h-5" />
                <h2 className="lobby-section-title">Solo Practice Arena</h2>
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
          </section>
        )}
      </main>
    </div>
  );
};
