import React, { useState } from 'react';
import { PokerTable } from './components/PokerTable';
import { LobbyModal } from './components/LobbyModal';
import { supabase } from './lib/supabaseClient';

export default function App() {
  const [isLobbyOpen, setIsLobbyOpen] = useState(false);
  const [gameConfig, setGameConfig] = useState({
    username: 'Parth',
    playerCount: 6,
    startingStack: 1500
  });

  const handleStartSimulation = (config) => {
    setGameConfig(config);
    setIsLobbyOpen(false);
  };

  const handleCreateRoom = async ({ username, name, startingStack }) => {
    try {
      const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data, error } = await supabase.rpc('create_poker_room', {
        p_name: name || 'Championship Table',
        p_code: randomCode,
        p_starting_stack: startingStack || 1500,
        p_small_blind: 10,
        p_big_blind: 20,
        p_turn_time: 25
      });

      if (error) {
        alert('Supabase error: ' + error.message);
        return;
      }

      alert(`Room created successfully! Room Code: ${randomCode}`);
      setIsLobbyOpen(false);
    } catch (err) {
      alert('Error creating room: ' + err.message);
    }
  };

  const handleJoinRoom = async ({ username, code }) => {
    try {
      const { data, error } = await supabase
        .from('poker_rooms')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();

      if (error || !data) {
        alert('Room not found! Check code or test in Practice mode.');
        return;
      }

      alert(`Joined room ${data.name}! Starting table...`);
      setIsLobbyOpen(false);
    } catch (err) {
      alert('Error joining room: ' + err.message);
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden">
      <PokerTable
        gameConfig={gameConfig}
        onOpenLobby={() => setIsLobbyOpen(true)}
      />

      <LobbyModal
        isOpen={isLobbyOpen}
        onStartSimulation={handleStartSimulation}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    </div>
  );
}
