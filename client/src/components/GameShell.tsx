import { useMemo, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from '../module_bindings';
import { games } from '../games/registry';
import type { GameProps, PlayerInfo } from '../games/types';
import '../App.css';

export function GameShell() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const gameType = searchParams.get('game') || '';
  const playerName = searchParams.get('name') || 'Player';
  const numericRoomId = Number(roomId);

  const connState = useSpacetimeDB();
  const conn = connState.getConnection() as DbConnection | undefined;

  const [allPlayers] = useTable(tables.players);
  const [allGameStates] = useTable(tables.game_states);

  const gameConfig = games.find((g) => g.id === gameType);

  // Find this room's players and state
  const roomPlayers = useMemo(
    () =>
      allPlayers
        .filter((p) => p.roomId === numericRoomId)
        .sort((a, b) => a.playerNumber - b.playerNumber),
    [allPlayers, numericRoomId]
  );

  const gameState = allGameStates.find((s) => s.roomId === numericRoomId);
  const myIdentity = connState.identity;
  const myPlayer = roomPlayers.find(
    (p) => myIdentity && p.identity.isEqual(myIdentity)
  );

  const players: PlayerInfo[] = useMemo(
    () =>
      roomPlayers.map((p) => ({
        name: p.displayName,
        playerNumber: p.playerNumber,
        score: p.score,
      })),
    [roomPlayers]
  );

  const onUpdateState = useCallback(
    (stateJson: string) => {
      conn?.reducers.updateGameState({ newStateJson: stateJson });
    },
    [conn]
  );

  const onEndTurn = useCallback(
    (stateJson: string) => {
      conn?.reducers.endTurn({ newStateJson: stateJson });
    },
    [conn]
  );

  const onEndGame = useCallback(
    (stateJson: string) => {
      conn?.reducers.endGame({ finalStateJson: stateJson });
    },
    [conn]
  );

  const handleLeave = () => {
    conn?.reducers.leaveRoom({});
    navigate('/');
  };

  if (!gameConfig) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Game Not Found</h1>
          <p>No game with id "{gameType}" exists.</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <button className="btn-primary" onClick={() => navigate('/')}>
            Back to Games
          </button>
        </div>
      </div>
    );
  }

  const GameComponent = gameConfig.component;
  const currentTurn = gameState?.currentTurn ?? 1;

  const gameProps: GameProps = {
    roomId: roomId || '',
    playerName,
    playerNumber: myPlayer?.playerNumber ?? 1,
    currentTurn,
    players,
    stateJson: gameState?.stateJson,
    onUpdateState,
    onEndTurn,
    onEndGame,
  };

  return (
    <div>
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border)',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>{gameConfig.name}</h2>
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Room {roomId}
          </span>
        </div>

        {/* Players */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {players.map((p) => (
            <div
              key={p.playerNumber}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.25rem 0.75rem',
                background:
                  p.playerNumber === currentTurn
                    ? 'var(--primary)'
                    : 'var(--bg-card)',
                color:
                  p.playerNumber === currentTurn
                    ? 'var(--bg)'
                    : 'var(--text)',
                borderRadius: 'var(--radius)',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              <span>{p.name}</span>
              <span style={{ opacity: 0.7 }}>{p.score}</span>
            </div>
          ))}
        </div>

        <button className="btn-danger" onClick={handleLeave}>
          Leave
        </button>
      </div>

      {/* Game Area */}
      <div style={{ padding: '1rem' }}>
        <GameComponent {...gameProps} />
      </div>
    </div>
  );
}
