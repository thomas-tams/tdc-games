import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GameProps } from '../types';
import {
  type BeerRunState,
  type BeerRunConfig,
  PLAYER_COLORS,
  PLAYER_X,
  WORLD_WIDTH,
  OBSTACLE_DEFS,
  SYNC_INTERVAL,
  SPEED_MAP,
  JUMP_VELOCITY,
  DENSITY_MAP,
  getRandomDeathMessage,
} from './types';
import { createInitialState, startGame, tickSimulation } from './simulation';
import './BeerRun.css';

function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

export function BeerRun({
  playerNumber,
  players,
  stateJson,
  isSpectator,
  onUpdateState,
  onEndGame,
}: GameProps) {
  const stateJsonRef = useRef(stateJson);
  useEffect(() => {
    stateJsonRef.current = stateJson;
  }, [stateJson]);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [jumpFlash, setJumpFlash] = useState(false);
  const [deathMessage, setDeathMessage] = useState<string | null>(null);
  // Local predicted state for smooth rendering
  const [localState, setLocalState] = useState<BeerRunState | null>(null);
  const localStateRef = useRef<BeerRunState | null>(null);

  const isHost = playerNumber === Math.min(...players.map((p) => p.playerNumber));

  const playerNumbers = useMemo(
    () => players.map((p) => p.playerNumber).sort((a, b) => a - b),
    [players]
  );

  const playerNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    for (const p of players) {
      map[p.playerNumber] = p.name;
    }
    return map;
  }, [players]);

  // Parse server state
  let serverState: BeerRunState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && parsed.phase) {
      serverState = parsed as BeerRunState;
    }
  } catch {
    // Invalid JSON
  }

  // Use local predicted state for rendering when playing, otherwise server state
  const state = (localState && localState.phase === 'playing') ? localState : serverState;

  // Host initializes state
  useEffect(() => {
    if (isHost && (!stateJson || stateJson === '{}' || stateJson === '')) {
      onUpdateState(JSON.stringify(createInitialState()));
    }
  }, [isHost, stateJson, onUpdateState]);

  // === HOST: Countdown timer ===
  useEffect(() => {
    if (!isHost || !serverState || serverState.phase !== 'countdown') return;
    const interval = setInterval(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as BeerRunState;
      if (current.phase !== 'countdown') return;
      if (Date.now() >= current.countdownEnd) {
        // Transition to playing with clean state
        const playState: BeerRunState = {
          ...current,
          phase: 'playing',
          gameTime: 0,
          spawnTimer: DENSITY_MAP[current.config.density],
        };
        onUpdateState(JSON.stringify(playState));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isHost, serverState?.phase, onUpdateState]);

  // === LOCAL: Countdown display ===
  useEffect(() => {
    if (!serverState || serverState.phase !== 'countdown') {
      setCountdown(null);
      return;
    }
    const update = () => {
      const remaining = Math.ceil((serverState!.countdownEnd - Date.now()) / 1000);
      setCountdown(Math.max(0, remaining));
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [serverState?.phase, serverState?.countdownEnd]);

  // === ALL CLIENTS: Local simulation loop for prediction ===
  useEffect(() => {
    if (!serverState || serverState.phase !== 'playing') {
      localStateRef.current = null;
      setLocalState(null);
      return;
    }

    // Initialize local state from server
    if (!localStateRef.current || localStateRef.current.phase !== 'playing') {
      localStateRef.current = JSON.parse(JSON.stringify(serverState));
    }

    let lastTime = performance.now();
    let lastSync = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!localStateRef.current || localStateRef.current.phase !== 'playing') {
        rafId = requestAnimationFrame(frame);
        return;
      }

      // Run simulation locally — host spawns obstacles, non-host only runs physics
      localStateRef.current = tickSimulation(
        localStateRef.current, dt, Date.now(), playerNameMap, isHost
      );

      // Host syncs authoritative state to SpacetimeDB
      if (isHost) {
        if (localStateRef.current.phase === 'finished') {
          onEndGame(JSON.stringify(localStateRef.current));
          setLocalState({ ...localStateRef.current });
          return;
        }

        if (now - lastSync >= SYNC_INTERVAL) {
          onUpdateState(JSON.stringify(localStateRef.current));
          lastSync = now;
        }
      }

      // Update React state for rendering (~60fps)
      setLocalState({ ...localStateRef.current });
      rafId = requestAnimationFrame(frame);
    };

    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [serverState?.phase, isHost, playerNameMap, onUpdateState, onEndGame]);

  // === RECONCILIATION: When server state arrives, merge with local prediction ===
  useEffect(() => {
    if (!serverState || serverState.phase !== 'playing' || !localStateRef.current) return;

    const local = localStateRef.current;

    // Merge obstacles by ID: keep local x for existing (deterministic), add new from server
    const localObsById = new Map(local.obstacles.map(o => [o.id, o]));
    local.obstacles = serverState.obstacles.map(serverObs => {
      const localObs = localObsById.get(serverObs.id);
      if (localObs) {
        // Existing obstacle — keep local x position (smooth deterministic movement)
        return { ...serverObs, x: localObs.x };
      }
      // New obstacle spawned by host — use server position
      return { ...serverObs };
    });
    local.eliminated = [...serverState.eliminated];
    local.winner = serverState.winner;
    local.phase = serverState.phase;
    local.gameTime = serverState.gameTime;
    local.scrollSpeed = serverState.scrollSpeed;
    local.spawnTimer = serverState.spawnTimer;
    local.nextObstacleId = serverState.nextObstacleId;
    local.lastEvent = serverState.lastEvent;
    local.config = serverState.config;

    // Reconcile player states
    for (const pnStr of Object.keys(serverState.playerStates)) {
      const pn = Number(pnStr);
      const serverPs = serverState.playerStates[pn];
      if (!serverPs) continue;

      if (pn === playerNumber && local.playerStates[pn]) {
        // Own player: keep local y/vy for snappy feel, but snap authoritative fields
        local.playerStates[pn].alive = serverPs.alive;
        local.playerStates[pn].eliminatedAt = serverPs.eliminatedAt;
        local.playerStates[pn].deathObstacleType = serverPs.deathObstacleType;
        // Clear jumpPressed if server consumed it
        if (!serverPs.jumpPressed) {
          local.playerStates[pn].jumpPressed = false;
        }
      } else {
        // Other players: snap to server state entirely
        local.playerStates[pn] = { ...serverPs };
      }
    }
  }, [stateJson, playerNumber]);

  // === Track death message ===
  useEffect(() => {
    if (!state) return;
    const ps = state.playerStates[playerNumber];
    if (ps && !ps.alive && ps.deathObstacleType && !deathMessage) {
      const name = playerNameMap[playerNumber] || `Player ${playerNumber}`;
      setDeathMessage(getRandomDeathMessage(name, ps.deathObstacleType));
    }
  }, [state, playerNumber, playerNameMap, deathMessage]);

  // === HANDLERS ===

  const handleConfigChange = useCallback(
    (key: keyof BeerRunConfig, value: BeerRunConfig[keyof BeerRunConfig]) => {
      const current = JSON.parse(stateJsonRef.current || '{}') as BeerRunState;
      if (current.phase !== 'setup') return;
      onUpdateState(JSON.stringify({ ...current, config: { ...current.config, [key]: value } }));
    },
    [onUpdateState]
  );

  const handleStartGame = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as BeerRunState;
    if (current.phase !== 'setup') return;
    onUpdateState(JSON.stringify(startGame(current, playerNumbers, Date.now())));
  }, [onUpdateState, playerNumbers]);

  const handleJump = useCallback(() => {
    if (isSpectator) return;

    // 1. Apply jump locally FIRST for instant feedback
    if (localStateRef.current) {
      const ps = localStateRef.current.playerStates[playerNumber];
      if (ps?.alive && ps.y <= 1) {
        ps.vy = JUMP_VELOCITY;
      }
    }

    // 2. Also send to host via SpacetimeDB for authoritative processing
    const current = JSON.parse(stateJsonRef.current || '{}') as BeerRunState;
    if (current.phase !== 'playing') return;
    const ps = current.playerStates?.[playerNumber];
    if (!ps?.alive) return;

    onUpdateState(
      JSON.stringify({
        ...current,
        playerStates: {
          ...current.playerStates,
          [playerNumber]: { ...ps, jumpPressed: true },
        },
      })
    );

    setJumpFlash(true);
    setTimeout(() => setJumpFlash(false), 150);
    if (navigator.vibrate) navigator.vibrate(30);
  }, [playerNumber, isSpectator, onUpdateState]);

  // === RENDERING ===

  if (!state) {
    return (
      <div className="br-game">
        <div className="br-waiting">Setting up Beer Run...</div>
      </div>
    );
  }

  const getPlayerName = (pn: number) =>
    players.find((p) => p.playerNumber === pn)?.name || `P${pn}`;

  // === SETUP PHASE ===
  if (state.phase === 'setup') {
    return (
      <div className="br-game">
        <h2 className="br-setup-title">🍺 Beer Run</h2>
        <p className="br-setup-subtitle">
          Jump over obstacles or drink trying. Emil would not survive the first obstacle.
        </p>

        {isHost ? (
          <div className="br-setup">
            <div className="br-setup-option">
              <span className="br-setup-label">Speed</span>
              <div className="br-setup-buttons">
                {(['slow', 'normal', 'fast'] as const).map((s) => (
                  <button
                    key={s}
                    className={`br-setup-btn ${state!.config.speed === s ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('speed', s)}
                  >
                    {s === 'slow' ? '🐌 Slow' : s === 'normal' ? '🏃 Normal' : '🔥 Fast'}
                  </button>
                ))}
              </div>
            </div>

            <div className="br-setup-option">
              <span className="br-setup-label">Obstacle Density</span>
              <div className="br-setup-buttons">
                {(['low', 'medium', 'high'] as const).map((d) => (
                  <button
                    key={d}
                    className={`br-setup-btn ${state!.config.density === d ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('density', d)}
                  >
                    {d === 'low' ? '😌 Low' : d === 'medium' ? '😅 Medium' : '🤯 High'}
                  </button>
                ))}
              </div>
            </div>

            <div className="br-setup-option">
              <span className="br-setup-label">Difficulty Ramp</span>
              <div className="br-setup-buttons">
                {(['gentle', 'normal', 'aggressive'] as const).map((r) => (
                  <button
                    key={r}
                    className={`br-setup-btn ${state!.config.ramp === r ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('ramp', r)}
                  >
                    {r === 'gentle' ? '🌿 Gentle' : r === 'normal' ? '📈 Normal' : '💀 Aggressive'}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn-primary br-start-btn"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              Start Beer Run!
            </button>
            {players.length < 2 && (
              <p className="br-hint">Need at least 2 players</p>
            )}
          </div>
        ) : (
          <div className="br-setup br-setup-waiting">
            <p>Waiting for host to configure...</p>
            <div className="br-config-preview">
              <span>Speed: {state.config.speed}</span>
              <span>Density: {state.config.density}</span>
              <span>Ramp: {state.config.ramp}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === COUNTDOWN ===
  if (state.phase === 'countdown') {
    return (
      <div className="br-game">
        <div className="br-countdown-overlay">
          <div className="br-countdown-title">🍺 Beer Run</div>
          <div className="br-countdown-number" key={countdown}>
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <div className="br-countdown-hint">TAP TO JUMP!</div>
        </div>
      </div>
    );
  }

  // === PLAYING / FINISHED ===
  const myState = state.playerStates[playerNumber];
  const amAlive = myState?.alive ?? false;
  const showResult = state.phase === 'finished';

  const rampMultiplier = state.scrollSpeed
    ? state.scrollSpeed / SPEED_MAP[state.config.speed]
    : 1;

  const previewPlayerX = (PLAYER_X / WORLD_WIDTH) * 100;

  return (
    <div className="br-game">
      {/* Event toast */}
      {state.lastEvent && Date.now() - state.lastEvent.timestamp < 3000 && (
        <div className="br-toast br-toast-eliminate">
          {state.lastEvent.playerName} eliminated!
        </div>
      )}

      {!showResult ? (
        <div className="br-playing">
          {/* Mini preview */}
          <div className="br-preview">
            <div className="br-preview-ground" />
            {/* My avatar */}
            <div
              className={`br-preview-avatar ${!amAlive ? 'dead' : ''}`}
              style={{
                left: `${previewPlayerX}%`,
                transform: `translateY(${-(myState?.y ?? 0) * 0.35}px)`,
              }}
            >
              🍺
            </div>
            {/* Obstacles */}
            {state.obstacles.map((obs) => {
              const xPercent = (obs.x / WORLD_WIDTH) * 100;
              if (xPercent < -10 || xPercent > 110) return null;
              return (
                <div
                  key={obs.id}
                  className="br-preview-obstacle"
                  style={{ left: `${xPercent}%` }}
                >
                  {OBSTACLE_DEFS[obs.type].emoji}
                </div>
              );
            })}
            {/* Speed indicator */}
            <div className="br-speed-indicator">
              {rampMultiplier.toFixed(1)}x
            </div>
          </div>

          {/* Status bar */}
          <div className="br-status-bar">
            {playerNumbers.map((pn, i) => {
              const ps = state!.playerStates[pn];
              const alive = ps?.alive ?? true;
              const isMe = pn === playerNumber;
              return (
                <div
                  key={pn}
                  className={`br-status-player ${!alive ? 'dead' : ''} ${isMe ? 'me' : ''}`}
                >
                  <div
                    className="br-status-dot"
                    style={{ background: alive ? getPlayerColor(i) : 'var(--text-muted)' }}
                  />
                  {getPlayerName(pn)}
                  {!alive && ' 💀'}
                </div>
              );
            })}
          </div>

          {/* Death message */}
          {!amAlive && deathMessage && (
            <div className="br-death-msg">{deathMessage}</div>
          )}

          {/* JUMP button */}
          {!isSpectator && (
            <button
              className={`br-jump-btn ${jumpFlash ? 'flash' : ''} ${!amAlive ? 'dead' : ''}`}
              onPointerDown={amAlive ? handleJump : undefined}
              disabled={!amAlive}
            >
              {amAlive ? '🍺 JUMP' : '💀 ELIMINATED'}
              {amAlive && (
                <span className="br-jump-label">Tap anywhere to jump!</span>
              )}
              {!amAlive && (
                <span className="br-jump-label">Watch the chaos unfold...</span>
              )}
            </button>
          )}
        </div>
      ) : (
        // === FINISHED ===
        <div className="br-result-overlay">
          <h2 className="br-result-title">🍺 Beer Run Over!</h2>
          {state.winner ? (
            <p className="br-result-winner">
              🏆 {getPlayerName(state.winner)} is the last beer standing!
            </p>
          ) : (
            <p className="br-result-winner">Everyone wiped out!</p>
          )}
          <div className="br-result-drinks">
            <h3>🍺 Drinking Rules</h3>
            {state.winner && (
              <div className="br-result-row winner">
                <span>{getPlayerName(state.winner)} (Winner)</span>
                <span>Give out 3 sips!</span>
              </div>
            )}
            {state.eliminated.length > 0 && state.eliminated.length > 1 && (
              <div className="br-result-row last-place">
                <span>{getPlayerName(state.eliminated[0])} (First out)</span>
                <span>Finish your drink!</span>
              </div>
            )}
            {state.eliminated.slice(state.eliminated.length > 1 ? 1 : 0).map((pn) => (
              <div key={pn} className="br-result-row">
                <span>{getPlayerName(pn)}</span>
                <span>Drink 1 sip!</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
