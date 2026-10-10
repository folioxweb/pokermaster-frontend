import React, { useState } from 'react';
import { Users, Bot, Play, LogIn, Plus } from 'lucide-react';

export const LobbyModal = ({
  isOpen = true,
  onStartSimulation = null,
  onCreateRoom = null,
  onJoinRoom = null
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('practice'); // 'practice' | 'multiplayer'
  const [username, setUsername] = useState('Parth');
  const [playerCount, setPlayerCount] = useState(6); // 3 to 8
  const [startingStack, setStartingStack] = useState(1500);
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('Championship Ring');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Decorative corner glows */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Title */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-wider uppercase mb-2">
            No-Limit Texas Hold'em
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            POKERMASTER
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Server-Authoritative • 3 to 8 Ring Table
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-xl mb-5 border border-slate-800">
          <button
            onClick={() => setActiveTab('practice')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'practice'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Practice / Bots</span>
          </button>
          <button
            onClick={() => setActiveTab('multiplayer')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
              activeTab === 'multiplayer'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Live Supabase</span>
          </button>
        </div>

        {/* Username Field */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Your Player Handle
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-400 transition"
            placeholder="Enter handle"
            maxLength={18}
          />
        </div>

        {activeTab === 'practice' ? (
          /* Practice / Bot Simulation Configuration */
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Ring Table Size (3 to 8 Players)
                </label>
                <span className="text-xs font-bold text-amber-400">{playerCount} Seats</span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                value={playerCount}
                onChange={(e) => setPlayerCount(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>3 Players</span>
                <span>6-Max</span>
                <span>8 Full Ring</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Starting Chips
              </label>
              <select
                value={startingStack}
                onChange={(e) => setStartingStack(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-400"
              >
                <option value={1000}>1,000 PTS - Fast Turbo</option>
                <option value={1500}>1,500 PTS - Standard Deep</option>
                <option value={3000}>3,000 PTS - Championship</option>
              </select>
            </div>

            <button
              onClick={() => onStartSimulation && onStartSimulation({ username, playerCount, startingStack })}
              className="w-full py-3.5 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm tracking-wide shadow-xl shadow-emerald-950 border border-emerald-300 transition active:scale-[0.98] flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>LAUNCH GAME TABLE</span>
            </button>
          </div>
        ) : (
          /* Supabase Live Multiplayer Mode */
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Room Name / Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. RING8 or Leave blank to create"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-indigo-400 uppercase tracking-widest"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => onCreateRoom && onCreateRoom({ username, name: roomName, startingStack })}
                className="py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition active:scale-[0.98] flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Table</span>
              </button>
              <button
                onClick={() => onJoinRoom && onJoinRoom({ username, code: roomCode })}
                className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 shadow-lg transition active:scale-[0.98] flex items-center justify-center space-x-1 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Join by Code</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
