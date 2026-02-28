import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { games } from '../games/registry';
import '../App.css';

export function GameSelector() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('tdc_player_name') || ''
  );
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const saveName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('tdc_player_name', name);
  };

  const handleCreateRoom = (gameId: string) => {
    if (!playerName.trim()) return;
    // Navigate to lobby — room creation happens there via SpacetimeDB
    navigate(`/lobby/new?game=${gameId}&name=${encodeURIComponent(playerName)}`);
  };

  const handleJoinRoom = () => {
    if (!playerName.trim() || !joinRoomId.trim()) return;
    navigate(
      `/lobby/${joinRoomId}?name=${encodeURIComponent(playerName)}`
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>TDC Games</h1>
        <p>Pick a game, invite friends, play together</p>
      </div>

      {/* Player Name */}
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <input
          type="text"
          placeholder="Your display name"
          value={playerName}
          onChange={(e) => saveName(e.target.value)}
          style={{ width: '280px', textAlign: 'center', fontSize: '1.1rem' }}
        />
      </div>

      {/* Game Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        {games.map((game) => (
          <div
            key={game.id}
            style={{
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius)',
              padding: '1.5rem',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h2 style={{ fontSize: '1.3rem' }}>{game.name}</h2>
            <p style={{ color: 'var(--text-muted)', flex: 1 }}>
              {game.description}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {game.minPlayers}–{game.maxPlayers} players
            </p>
            <button
              className="btn-primary"
              disabled={!playerName.trim()}
              onClick={() => handleCreateRoom(game.id)}
            >
              Create Room
            </button>
          </div>
        ))}
      </div>

      {/* Join Room */}
      <div style={{ textAlign: 'center' }}>
        {!showJoinForm ? (
          <button
            className="btn-secondary"
            onClick={() => setShowJoinForm(true)}
          >
            Join a Room
          </button>
        ) : (
          <div
            style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
          >
            <input
              type="text"
              placeholder="Room ID"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              style={{ width: '140px', textAlign: 'center' }}
            />
            <button
              className="btn-primary"
              disabled={!playerName.trim() || !joinRoomId.trim()}
              onClick={handleJoinRoom}
            >
              Join
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowJoinForm(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
