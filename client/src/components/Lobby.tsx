import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '../module_bindings';
import { games } from '../games/registry';
import '../App.css';

export function Lobby() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const gameType = searchParams.get('game') || '';
  const playerName = searchParams.get('name') || 'Player';
  const isNewRoom = roomId === 'new';
  const isSpectating = searchParams.get('spectate') === 'true';

  const connState = useSpacetimeDB();
  const conn = connState.getConnection() as DbConnection | undefined;

  // Subscribe to rooms and players
  const [allRooms] = useTable(tables.rooms);
  const [allPlayers] = useTable(tables.players);

  // Create or join room on mount
  useEffect(() => {
    if (!conn || !connState.isActive) return;

    if (isSpectating && roomId && roomId !== 'new') {
      conn.reducers.joinAsSpectator({
        roomId: Number(roomId),
        displayName: playerName,
      });
    } else if (isNewRoom && gameType) {
      const config = games.find((g) => g.id === gameType);
      conn.reducers.createRoom({
        gameType,
        maxPlayers: config?.maxPlayers || 4,
        displayName: playerName,
      });
    } else if (roomId && roomId !== 'new') {
      conn.reducers.joinRoom({
        roomId: Number(roomId),
        displayName: playerName,
      });
    }
  }, [conn, connState.isActive, isNewRoom, gameType, roomId, playerName, isSpectating]);

  // Find the room this player is in
  const myIdentity = connState.identity;
  const myPlayer = allPlayers.find(
    (p) => myIdentity && p.identity.isEqual(myIdentity)
  );
  const currentRoomId = myPlayer?.roomId;
  const room = allRooms.find((r) => r.id === currentRoomId);
  const roomPlayers = useMemo(
    () => allPlayers.filter((p) => p.roomId === currentRoomId),
    [allPlayers, currentRoomId]
  );

  const activePlayers = useMemo(
    () => roomPlayers.filter((p) => !p.isSpectator),
    [roomPlayers]
  );
  const spectators = useMemo(
    () => roomPlayers.filter((p) => p.isSpectator),
    [roomPlayers]
  );

  // Navigate to game when room status changes to 'playing'
  useEffect(() => {
    if (room?.status === 'playing' && currentRoomId != null) {
      navigate(
        `/play/${currentRoomId}?game=${room.gameType}&name=${encodeURIComponent(playerName)}`
      );
    }
  }, [room?.status, room?.gameType, currentRoomId, playerName, navigate]);

  // If spectating a room that's already playing, go straight to game
  useEffect(() => {
    if (isSpectating && room?.status === 'playing' && currentRoomId != null) {
      navigate(
        `/play/${currentRoomId}?game=${room.gameType}&name=${encodeURIComponent(playerName)}`
      );
    }
  }, [isSpectating, room?.status, room?.gameType, currentRoomId, playerName, navigate]);

  const handleStartGame = () => {
    if (!conn || !room) return;
    conn.reducers.startGame({ initialStateJson: '{}' });
  };

  const handleLeave = () => {
    if (conn) conn.reducers.leaveRoom({});
    navigate('/');
  };

  const gameConfig = games.find((g) => g.id === (room?.gameType || gameType));

  return (
    <div className="page">
      <div className="page-header">
        <h1>{gameConfig?.name || 'Lobby'}</h1>
        <p>
          {!room
            ? isNewRoom
              ? 'Creating room...'
              : isSpectating
                ? 'Joining as spectator...'
                : 'Joining room...'
            : isSpectating
              ? 'Waiting for game to start'
              : 'Waiting for players'}
        </p>
      </div>

      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius)',
          padding: '2rem',
          border: '1px solid var(--border)',
          maxWidth: '500px',
          margin: '0 auto',
        }}
      >
        <h2 style={{ marginBottom: '1rem' }}>Room Info</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          Room ID:{' '}
          <span
            style={{
              color: 'var(--primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '1.2rem',
            }}
          >
            {currentRoomId ?? '...'}
          </span>
        </p>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Share this ID with friends to let them join!
        </p>

        <h3 style={{ marginBottom: '0.75rem' }}>
          Players ({activePlayers.length}/{room?.maxPlayers ?? '?'})
        </h3>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            marginBottom: '1.5rem',
          }}
        >
          {activePlayers.map((p) => (
            <div
              key={p.playerNumber}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                }}
              />
              <span>{p.displayName}</span>
              {p.isHost && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    marginLeft: 'auto',
                    fontSize: '0.85rem',
                  }}
                >
                  Host
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Spectators */}
        {spectators.length > 0 && (
          <>
            <h3 style={{ marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Spectators ({spectators.length})
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '1.5rem',
              }}
            >
              {spectators.map((p, i) => (
                <div
                  key={`spectator-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius)',
                    opacity: 0.7,
                  }}
                >
                  <span style={{ fontSize: '0.85rem' }}>&#128065;</span>
                  <span>{p.displayName}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {myPlayer?.isHost && (
            <button
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={activePlayers.length < (gameConfig?.minPlayers || 1)}
              onClick={handleStartGame}
            >
              Start Game
              {activePlayers.length < (gameConfig?.minPlayers || 1) &&
                ` (need ${gameConfig?.minPlayers || 1})`}
            </button>
          )}
          <button className="btn-danger" onClick={handleLeave}>
            {isSpectating ? 'Stop Watching' : 'Leave'}
          </button>
        </div>
      </div>
    </div>
  );
}
