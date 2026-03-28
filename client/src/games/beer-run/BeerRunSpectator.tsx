import { useState, useEffect, useRef } from 'react';
import type { GameProps } from '../types';
import {
  type BeerRunState,
  PLAYER_COLORS,
  PLAYER_X,
  WORLD_WIDTH,
  OBSTACLE_DEFS,
  SPEED_MAP,
  getRandomDeathMessage,
} from './types';
import { tickSimulation } from './simulation';
import './BeerRun.css';

function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

interface Toast {
  id: number;
  message: string;
  timestamp: number;
}

interface Splash {
  id: number;
  laneIndex: number;
  emoji: string;
  timestamp: number;
}

export function BeerRunSpectator({
  players,
  stateJson,
}: GameProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const [localState, setLocalState] = useState<BeerRunState | null>(null);
  const localStateRef = useRef<BeerRunState | null>(null);
  const lastEventRef = useRef<number>(0);
  const toastIdRef = useRef(0);

  const playerNumbers = players.map((p) => p.playerNumber).sort((a, b) => a - b);

  const playerNameMap: Record<number, string> = {};
  for (const p of players) {
    playerNameMap[p.playerNumber] = p.name;
  }

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

  // Use local interpolated state when playing, server state otherwise
  const state = (localState && localState.phase === 'playing') ? localState : serverState;

  // === Local interpolation loop for smooth rendering ===
  useEffect(() => {
    if (!serverState || serverState.phase !== 'playing') {
      localStateRef.current = null;
      setLocalState(null);
      return;
    }

    if (!localStateRef.current || localStateRef.current.phase !== 'playing') {
      localStateRef.current = JSON.parse(JSON.stringify(serverState));
    }

    let lastTime = performance.now();
    let lastRender = 0;

    const frame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (!localStateRef.current || localStateRef.current.phase !== 'playing') {
        rafId = requestAnimationFrame(frame);
        return;
      }

      // Run physics-only simulation (not host — no spawning/collision)
      localStateRef.current = tickSimulation(
        localStateRef.current, dt, Date.now(), playerNameMap, false
      );

      // Throttled React render every 100ms — CSS transitions handle smooth interpolation
      if (now - lastRender >= 100) {
        setLocalState({ ...localStateRef.current });
        lastRender = now;
      }

      rafId = requestAnimationFrame(frame);
    };

    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [serverState?.phase]);

  // === Reconcile with server state ===
  useEffect(() => {
    if (!serverState || serverState.phase !== 'playing' || !localStateRef.current) return;
    const local = localStateRef.current;

    // Merge obstacles by ID: keep local x for existing (smooth), add new from server
    const localObsById = new Map(local.obstacles.map(o => [o.id, o]));
    local.obstacles = serverState.obstacles.map(serverObs => {
      const localObs = localObsById.get(serverObs.id);
      if (localObs) {
        return { ...serverObs, x: localObs.x };
      }
      return { ...serverObs };
    });

    // Snap all other fields from server
    local.playerStates = JSON.parse(JSON.stringify(serverState.playerStates));
    local.eliminated = [...serverState.eliminated];
    local.winner = serverState.winner;
    local.phase = serverState.phase;
    local.gameTime = serverState.gameTime;
    local.scrollSpeed = serverState.scrollSpeed;
    local.spawnTimer = serverState.spawnTimer;
    local.nextObstacleId = serverState.nextObstacleId;
    local.lastEvent = serverState.lastEvent;
    local.config = serverState.config;
  }, [stateJson]);

  const getPlayerName = (pn: number) =>
    players.find((p) => p.playerNumber === pn)?.name || `P${pn}`;

  // === Countdown display ===
  useEffect(() => {
    if (!state || state.phase !== 'countdown') {
      setCountdown(null);
      return;
    }
    const update = () => {
      const remaining = Math.ceil((state!.countdownEnd - Date.now()) / 1000);
      setCountdown(Math.max(0, remaining));
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [state?.phase, state?.countdownEnd]);

  // === Track events for toasts ===
  useEffect(() => {
    if (!serverState?.lastEvent) return;
    if (serverState.lastEvent.timestamp <= lastEventRef.current) return;
    lastEventRef.current = serverState.lastEvent.timestamp;

    const evt = serverState.lastEvent;
    const msg = getRandomDeathMessage(evt.playerName, evt.obstacleType);
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev.slice(-4), { id, message: msg, timestamp: Date.now() }]);

    // Add splash effect
    const laneIndex = playerNumbers.indexOf(evt.player);
    if (laneIndex >= 0) {
      setSplashes((prev) => [...prev, { id, laneIndex, emoji: '💥', timestamp: Date.now() }]);
    }
  }, [serverState?.lastEvent?.timestamp]);

  // === Clean up old toasts and splashes ===
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => now - t.timestamp < 4000));
      setSplashes((prev) => prev.filter((s) => now - s.timestamp < 600));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  if (!state) {
    return (
      <div className="br-spectator">
        <div className="br-waiting">Waiting for Beer Run to start...</div>
      </div>
    );
  }

  // === SETUP PHASE ===
  if (state.phase === 'setup') {
    return (
      <div className="br-spectator">
        <h2 className="br-spectator-title">🍺 Beer Run</h2>
        <p className="br-setup-subtitle">
          Side-scrolling obstacle runner. Jump or drink! Emil would not survive.
        </p>
        <div className="br-setup br-setup-waiting" style={{ maxWidth: 500 }}>
          <p>Waiting for host to start...</p>
          <div className="br-config-preview">
            <span>Speed: {state.config.speed}</span>
            <span>Density: {state.config.density}</span>
            <span>Ramp: {state.config.ramp}</span>
          </div>
          <div className="br-scoreboard" style={{ marginTop: '1rem' }}>
            {playerNumbers.map((pn, i) => (
              <div key={pn} className="br-scoreboard-player">
                <div className="br-status-dot" style={{ background: getPlayerColor(i) }} />
                {getPlayerName(pn)}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // === COUNTDOWN ===
  if (state.phase === 'countdown') {
    return (
      <div className="br-spectator br-spectator-countdown">
        <div className="br-countdown-title">🍺 Beer Run</div>
        <div className="br-countdown-number" key={countdown}>
          {countdown === 0 ? 'GO!' : countdown}
        </div>
        <div className="br-scoreboard">
          {playerNumbers.map((pn, i) => (
            <div key={pn} className="br-scoreboard-player">
              <div className="br-status-dot" style={{ background: getPlayerColor(i) }} />
              {getPlayerName(pn)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // === FINISHED ===
  if (state.phase === 'finished') {
    return (
      <div className="br-spectator">
        {/* Toasts */}
        <div className="br-spectator-toasts">
          {toasts.map((t) => (
            <div key={t.id} className="br-spectator-toast">{t.message}</div>
          ))}
        </div>

        <div className="br-spectator-result">
          <h2>🍺 Beer Run Over!</h2>
          {state.winner ? (
            <div className="br-spectator-winner">
              🏆 {getPlayerName(state.winner)} is the last beer standing!
            </div>
          ) : (
            <div className="br-spectator-winner">Everyone wiped out!</div>
          )}
          <div className="br-spectator-drink-tally">
            {state.winner && (
              <div className="br-spectator-tally-row winner">
                <span>{getPlayerName(state.winner)} (Winner)</span>
                <span>Give out 3 sips!</span>
              </div>
            )}
            {state.eliminated.length > 1 && (
              <div className="br-spectator-tally-row last-place">
                <span>{getPlayerName(state.eliminated[0])} (First out)</span>
                <span>Finish your drink!</span>
              </div>
            )}
            {state.eliminated.slice(state.eliminated.length > 1 ? 1 : 0).map((pn) => (
              <div key={pn} className="br-spectator-tally-row">
                <span>{getPlayerName(pn)}</span>
                <span>Drink 1 sip!</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // === PLAYING ===
  const rampMultiplier = state.scrollSpeed / SPEED_MAP[state.config.speed];
  const numPlayers = playerNumbers.length;
  const laneHeightPercent = 100 / numPlayers;
  const previewPlayerXPercent = (PLAYER_X / WORLD_WIDTH) * 100;

  return (
    <div className="br-spectator">
      {/* Toasts */}
      <div className="br-spectator-toasts">
        {toasts.map((t) => (
          <div key={t.id} className="br-spectator-toast">{t.message}</div>
        ))}
      </div>

      {/* Scoreboard */}
      <div className="br-scoreboard">
        {playerNumbers.map((pn, i) => {
          const ps = state!.playerStates[pn];
          const alive = ps?.alive ?? true;
          return (
            <div key={pn} className={`br-scoreboard-player ${!alive ? 'dead' : ''}`}>
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

      {/* Side-scrolling world */}
      <div className="br-world">
        {/* Speed indicator */}
        <div className="br-speed-indicator">
          ⚡ {rampMultiplier.toFixed(1)}x
        </div>

        {/* Lanes */}
        {playerNumbers.map((pn, laneIdx) => {
          const ps = state!.playerStates[pn];
          const alive = ps?.alive ?? true;
          const color = getPlayerColor(laneIdx);
          const laneTop = laneIdx * laneHeightPercent;
          const laneHeight = laneHeightPercent;
          // Scale jump height relative to lane height
          const maxJumpPx = 60;
          const jumpOffset = ps ? Math.min((ps.y / 120) * maxJumpPx, maxJumpPx) : 0;

          return (
            <div
              key={pn}
              className="br-lane"
              style={{
                top: `${laneTop}%`,
                height: `${laneHeight}%`,
              }}
            >
              {/* Lane background tint */}
              <div className="br-lane-bg" style={{ background: color }} />
              <div className="br-lane-ground" />

              {/* Player name */}
              <div className="br-lane-name" style={{ color }}>
                {getPlayerName(pn)} {!alive && '💀'}
              </div>

              {/* Beer avatar */}
              <div
                className={`br-lane-avatar ${!alive ? 'dead' : ''}`}
                style={{
                  left: `${previewPlayerXPercent}%`,
                  transform: `translateY(${-jumpOffset}px)`,
                }}
              >
                🍺
              </div>

              {/* Obstacles in this lane */}
              {state!.obstacles.map((obs) => {
                const xPercent = (obs.x / WORLD_WIDTH) * 100;
                if (xPercent < -5 || xPercent > 105) return null;
                // Scale obstacle size based on lane height
                const fontSize = obs.height > 40 ? '1.4rem' : '1.1rem';
                return (
                  <div
                    key={obs.id}
                    className="br-lane-obstacle"
                    style={{
                      left: `${xPercent}%`,
                      fontSize,
                    }}
                  >
                    {OBSTACLE_DEFS[obs.type].emoji}
                  </div>
                );
              })}

              {/* Splash effects */}
              {splashes
                .filter((s) => s.laneIndex === laneIdx)
                .map((s) => (
                  <div
                    key={s.id}
                    className="br-splash"
                    style={{
                      left: `${previewPlayerXPercent}%`,
                      bottom: '10%',
                    }}
                  >
                    {s.emoji}
                  </div>
                ))}
            </div>
          );
        })}
      </div>

      {/* Game time */}
      <div className="br-hint">
        Time: {Math.floor(state.gameTime)}s | Alive: {
          Object.values(state.playerStates).filter((ps) => ps.alive).length
        } / {numPlayers}
      </div>
    </div>
  );
}
