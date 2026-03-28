import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import { games } from '../games/registry';
import '../App.css';

export function GameSelector() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('tdc_player_name') || ''
  );
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  // Subscribe to rooms and players for open lobby listing
  const [allRooms] = useTable(tables.rooms);
  const [allPlayers] = useTable(tables.players);

  const openLobbies = useMemo(() => {
    const lobbies = allRooms
      .filter((r) => r.status === 'waiting')
      .map((r) => {
        const playerCount = allPlayers.filter(
          (p) => p.roomId === r.id && !p.isSpectator
        ).length;
        const game = games.find((g) => g.id === r.gameType);
        return { room: r, playerCount, game };
      });
    lobbies.sort((a, b) => b.playerCount - a.playerCount);
    return lobbies;
  }, [allRooms, allPlayers]);

  const activeGames = useMemo(() => {
    return allRooms
      .filter((r) => r.status === 'playing')
      .map((r) => {
        const playerCount = allPlayers.filter(
          (p) => p.roomId === r.id && !p.isSpectator
        ).length;
        const game = games.find((g) => g.id === r.gameType);
        return { room: r, playerCount, game };
      });
  }, [allRooms, allPlayers]);

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

      {/* Open Lobbies */}
      {openLobbies.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1.3rem',
              marginBottom: '1rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            Open Lobbies
          </h2>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxWidth: '500px',
              margin: '0 auto',
            }}
          >
            {openLobbies.map(({ room, playerCount, game }) => (
              <div
                key={room.id}
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--success)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>
                    {game?.name || room.gameType}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      marginLeft: '0.75rem',
                    }}
                  >
                    {playerCount}/{room.maxPlayers} players
                  </span>
                </div>
                <button
                  className="btn-primary"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                  disabled={!playerName.trim() || playerCount >= room.maxPlayers}
                  onClick={() =>
                    navigate(
                      `/lobby/${room.id}?name=${encodeURIComponent(playerName)}`
                    )
                  }
                >
                  {playerCount >= room.maxPlayers ? 'Full' : 'Join'}
                </button>
                <button
                  className="btn-secondary"
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  disabled={!playerName.trim()}
                  onClick={() =>
                    navigate(
                      `/lobby/${room.id}?name=${encodeURIComponent(playerName)}&spectate=true`
                    )
                  }
                >
                  Watch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Games (Watch) */}
      {activeGames.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1.3rem',
              marginBottom: '1rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            Active Games
          </h2>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              maxWidth: '500px',
              margin: '0 auto',
            }}
          >
            {activeGames.map(({ room, playerCount, game }) => (
              <div
                key={room.id}
                style={{
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>
                    {game?.name || room.gameType}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      marginLeft: '0.75rem',
                    }}
                  >
                    {playerCount} playing
                  </span>
                </div>
                <button
                  className="btn-secondary"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                  disabled={!playerName.trim()}
                  onClick={() =>
                    navigate(
                      `/lobby/${room.id}?game=${room.gameType}&name=${encodeURIComponent(playerName)}&spectate=true`
                    )
                  }
                >
                  Watch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Room by ID */}
      <div style={{ textAlign: 'center' }}>
        {!showJoinForm ? (
          <button
            className="btn-secondary"
            onClick={() => setShowJoinForm(true)}
          >
            Join by Room ID
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
              disabled={!playerName.trim() || !joinRoomId.trim()}
              onClick={() => {
                if (!playerName.trim() || !joinRoomId.trim()) return;
                navigate(
                  `/lobby/${joinRoomId}?name=${encodeURIComponent(playerName)}&spectate=true`
                );
              }}
            >
              Watch
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
