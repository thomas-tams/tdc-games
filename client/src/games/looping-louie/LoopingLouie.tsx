import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GameProps } from '../types';
import {
  type LoopingLouieState,
  type LoopingLouieConfig,
  createInitialState,
  startGame,
  tickSimulation,
  getPlayerZones,
  isPlaneInZone,
  PADDLE_WINDOW_DEGREES,
} from './simulation';
import './LoopingLouie.css';

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/** Build a conic-gradient string for zone arcs */
function buildZoneArcsGradient(
  playerZones: Record<number, number>,
  playerNumbers: number[],
  myPlayerNumber: number,
  planeAngle: number,
  isSpectator: boolean
): string {
  const stops: string[] = [];
  // Sort zones by angle for proper gradient construction
  const zones = playerNumbers
    .map((pn, i) => ({
      pn,
      angle: playerZones[pn],
      color: getPlayerColor(i),
    }))
    .sort((a, b) => a.angle - b.angle);

  for (const zone of zones) {
    const startAngle = ((zone.angle - PADDLE_WINDOW_DEGREES + 360) % 360);
    const endAngle = ((zone.angle + PADDLE_WINDOW_DEGREES) % 360);
    const isMe = zone.pn === myPlayerNumber && !isSpectator;

    // Check proximity to plane
    const diff = ((planeAngle - zone.angle + 540) % 360) - 180;
    const planeInZone = Math.abs(diff) <= PADDLE_WINDOW_DEGREES;
    const planeNearby = Math.abs(diff) <= 40;

    let opacity = isMe ? 0.2 : 0.1;
    if (planeInZone && isMe) opacity = 0.5;
    else if (planeNearby && isMe) opacity = 0.35;

    const color = zone.color;
    // Add transparent before, colored arc, transparent after
    stops.push(`transparent ${startAngle}deg`);
    stops.push(`${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} ${startAngle}deg`);
    stops.push(`${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')} ${endAngle}deg`);
    stops.push(`transparent ${endAngle}deg`);
  }

  return `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

export function LoopingLouie({
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

  const [localAngle, setLocalAngle] = useState(0);
  const [localHeight, setLocalHeight] = useState(0.8);
  const [paddleFlash, setPaddleFlash] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const isHost = playerNumber === Math.min(...players.map((p) => p.playerNumber));

  const playerNumbers = useMemo(
    () => players.map((p) => p.playerNumber).sort((a, b) => a - b),
    [players]
  );

  const playerZones = useMemo(
    () => getPlayerZones(playerNumbers),
    [playerNumbers]
  );

  const myZoneAngle = playerZones[playerNumber] ?? 0;

  // Parse state
  let state: LoopingLouieState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && parsed.phase) {
      state = parsed as LoopingLouieState;
    }
  } catch {
    // Invalid JSON
  }

  // Host initializes state
  useEffect(() => {
    if (isHost && (!stateJson || stateJson === '{}' || stateJson === '')) {
      onUpdateState(JSON.stringify(createInitialState()));
    }
  }, [isHost, stateJson, onUpdateState]);

  // === HOST: Countdown timer ===
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'countdown') return;
    const interval = setInterval(() => {
      const now = Date.now();
      const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
      if (current.phase !== 'countdown') return;
      if (now >= current.countdownEnd) {
        onUpdateState(JSON.stringify({ ...current, phase: 'playing' }));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isHost, state?.phase, onUpdateState]);

  // === LOCAL: Countdown display ===
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

  // === HOST: Run simulation loop ===
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'playing') return;
    let lastTime = performance.now();
    let lastSync = 0;
    const SYNC_INTERVAL = 100;

    const frame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
      if (current.phase !== 'playing') return;

      const newState = tickSimulation(current, dt, playerZones, Date.now());

      if (newState.phase === 'finished') {
        onEndGame(JSON.stringify(newState));
        return;
      }

      if (now - lastSync >= SYNC_INTERVAL) {
        onUpdateState(JSON.stringify(newState));
        lastSync = now;
      }

      rafId = requestAnimationFrame(frame);
    };

    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [isHost, state?.phase, playerZones, onUpdateState, onEndGame]);

  // === ALL: Local interpolation ===
  useEffect(() => {
    if (!state || (state.phase !== 'playing' && state.phase !== 'finished')) return;
    const frame = () => {
      const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
      if (current.phase === 'playing' || current.phase === 'finished') {
        setLocalAngle(current.planeAngle);
        setLocalHeight(current.planeHeight);
      }
      rafId = requestAnimationFrame(frame);
    };
    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [state?.phase]);

  // === HANDLERS ===

  const handleConfigChange = useCallback(
    (key: keyof LoopingLouieConfig, value: LoopingLouieConfig[keyof LoopingLouieConfig]) => {
      const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
      if (current.phase !== 'setup') return;
      onUpdateState(JSON.stringify({ ...current, config: { ...current.config, [key]: value } }));
    },
    [onUpdateState]
  );

  const handleStartGame = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
    if (current.phase !== 'setup') return;
    onUpdateState(JSON.stringify(startGame(current, playerNumbers, Date.now())));
  }, [onUpdateState, playerNumbers]);

  const handlePaddle = useCallback(() => {
    if (isSpectator) return;
    const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
    if (current.phase !== 'playing') return;
    if (current.eliminated?.includes(playerNumber)) return;

    onUpdateState(
      JSON.stringify({
        ...current,
        paddlePresses: { ...current.paddlePresses, [playerNumber]: Date.now() },
      })
    );

    setPaddleFlash(true);
    setTimeout(() => setPaddleFlash(false), 200);
    if (navigator.vibrate) navigator.vibrate(50);
  }, [playerNumber, isSpectator, onUpdateState]);

  // === RENDERING ===

  if (!state) {
    return (
      <div className="ll-game">
        <div className="ll-waiting">Setting up Looping Louie...</div>
      </div>
    );
  }

  const getPlayerName = (pn: number) =>
    players.find((p) => p.playerNumber === pn)?.name || `P${pn}`;

  // === SETUP PHASE ===
  if (state.phase === 'setup') {
    return (
      <div className="ll-game">
        <h2 className="ll-setup-title">Looping Louie</h2>
        <p className="ll-setup-subtitle">Protect your chickens from the crazy pilot!</p>

        {isHost ? (
          <div className="ll-setup">
            <div className="ll-setup-option">
              <span className="ll-setup-label">Speed</span>
              <div className="ll-setup-buttons">
                {(['slow', 'normal', 'fast'] as const).map((s) => (
                  <button
                    key={s}
                    className={`ll-setup-btn ${state.config.speed === s ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('speed', s)}
                  >
                    {s === 'slow' ? '🐌 Slow' : s === 'normal' ? '🛩️ Normal' : '🔥 Fast'}
                  </button>
                ))}
              </div>
            </div>

            <div className="ll-setup-option">
              <span className="ll-setup-label">Chickens</span>
              <div className="ll-setup-buttons">
                {([3, 5] as const).map((n) => (
                  <button
                    key={n}
                    className={`ll-setup-btn ${state.config.chickensPerPlayer === n ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('chickensPerPlayer', n)}
                  >
                    {'🐔'.repeat(Math.min(n, 3))}{n === 5 ? '+2' : ''} ({n})
                  </button>
                ))}
              </div>
            </div>

            <div className="ll-setup-option">
              <span className="ll-setup-label">Chaos Mode</span>
              <div className="ll-setup-buttons">
                <button
                  className={`ll-setup-btn ${!state.config.chaosMode ? 'selected' : ''}`}
                  onClick={() => handleConfigChange('chaosMode', false)}
                >
                  Off
                </button>
                <button
                  className={`ll-setup-btn ${state.config.chaosMode ? 'selected' : ''}`}
                  onClick={() => handleConfigChange('chaosMode', true)}
                >
                  🌀 On
                </button>
              </div>
            </div>

            <button
              className="btn-primary ll-start-btn"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              Start Game
            </button>
            {players.length < 2 && (
              <p className="ll-hint">Need at least 2 players</p>
            )}
          </div>
        ) : (
          <div className="ll-setup ll-setup-waiting">
            <p>Waiting for host to configure...</p>
            <div className="ll-config-preview">
              <span>Speed: {state.config.speed}</span>
              <span>Chickens: {state.config.chickensPerPlayer}</span>
              <span>Chaos: {state.config.chaosMode ? 'On' : 'Off'}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === COUNTDOWN ===
  if (state.phase === 'countdown') {
    return (
      <div className="ll-game">
        <div className="ll-countdown-overlay">
          <div className="ll-countdown-title">Looping Louie</div>
          <div className="ll-countdown-number" key={countdown}>
            {countdown === 0 ? 'GO!' : countdown}
          </div>
          <div className="ll-countdown-hint">
            Tap the paddle when the plane approaches!
          </div>
        </div>
      </div>
    );
  }

  // === PLAYING / FINISHED ===
  const isEliminated = state.eliminated.includes(playerNumber);
  const myChickens = state.chickens[playerNumber] ?? 0;
  const maxChickens = state.config.chickensPerPlayer;
  const planeApproaching = isPlaneInZone(localAngle, myZoneAngle);
  const planeNearby = (() => {
    const diff = ((localAngle - myZoneAngle + 540) % 360) - 180;
    return Math.abs(diff) <= 40;
  })();
  const showResult = state.phase === 'finished';

  // Build zone arcs gradient
  const arcsGradient = buildZoneArcsGradient(
    playerZones, playerNumbers, playerNumber, localAngle, isSpectator
  );

  return (
    <div className="ll-game">
      {/* Event toast */}
      {state.lastEvent && Date.now() - state.lastEvent.timestamp < 2000 && (
        <div className={`ll-toast ll-toast-${state.lastEvent.type}`}>
          {state.lastEvent.type === 'hit' && (
            <>🐔 {getPlayerName(state.lastEvent.player)} lost a chicken! DRINK!</>
          )}
          {state.lastEvent.type === 'deflect' && (
            <>🏓 {getPlayerName(state.lastEvent.player)} deflected!</>
          )}
          {state.lastEvent.type === 'eliminate' && (
            <>💀 {getPlayerName(state.lastEvent.player)} is out! FINISH YOUR DRINK!</>
          )}
        </div>
      )}

      {/* Circular track */}
      <div className="ll-track-container">
        <div className="ll-track">
          {/* Zone arcs overlay */}
          <div
            className="ll-zone-arcs"
            style={{ background: arcsGradient }}
          />

          {/* Zone labels */}
          {playerNumbers.map((pn, i) => {
            const angle = playerZones[pn];
            const isMe = pn === playerNumber;
            const eliminated = state!.eliminated.includes(pn);
            const chickens = state!.chickens[pn] ?? 0;
            return (
              <div
                key={pn}
                className={`ll-zone ${isMe ? 'mine' : ''} ${eliminated ? 'eliminated' : ''}`}
                style={{
                  '--zone-angle': `${angle}deg`,
                  '--zone-color': getPlayerColor(i),
                } as React.CSSProperties}
              >
                <div className="ll-zone-label">
                  <span className="ll-zone-name">{getPlayerName(pn)}</span>
                  <span className="ll-zone-barn">🏠</span>
                  <span className="ll-zone-chickens">
                    {Array.from({ length: maxChickens }).map((_, ci) => (
                      <span key={ci} className={`ll-mini-chicken ${ci >= chickens ? 'lost' : ''}`}>
                        🐔
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Plane */}
          <div
            className={`ll-plane ${localHeight < 0.35 ? 'low' : ''}`}
            style={{
              '--plane-angle': `${localAngle}deg`,
              '--plane-height': localHeight,
            } as React.CSSProperties}
          >
            🛩️
          </div>

          <div className="ll-center" />
        </div>
      </div>

      {/* My chickens */}
      <div className="ll-my-chickens">
        <div className="ll-chicken-row">
          {Array.from({ length: maxChickens }).map((_, i) => (
            <span
              key={i}
              className={`ll-chicken ${i >= myChickens ? 'lost' : ''}`}
            >
              🐔
            </span>
          ))}
        </div>
        {isEliminated && (
          <div className="ll-eliminated-text">You're out! Finish your drink!</div>
        )}
      </div>

      {/* Drink counter */}
      <div className="ll-drinks">
        🍺 Drinks: {state.drinks[playerNumber] ?? 0}
      </div>

      {/* Paddle button */}
      {!showResult && !isEliminated && !isSpectator && (
        <button
          className={`ll-paddle-btn ${planeApproaching ? 'in-zone' : planeNearby ? 'approaching' : ''} ${paddleFlash ? 'flash' : ''}`}
          onPointerDown={handlePaddle}
        >
          {planeApproaching ? '⬆️ NOW!' : planeNearby ? '⚠️ Get ready...' : '🏓 PADDLE'}
        </button>
      )}

      {/* Game over overlay */}
      {showResult && (
        <div className="ll-result-overlay">
          <h2 className="ll-result-title">Game Over!</h2>
          {state.winner && (
            <p className="ll-result-winner">
              🏆 {getPlayerName(state.winner)} wins!
            </p>
          )}
          <div className="ll-result-drinks">
            <h3>🍺 Drink Tally</h3>
            {playerNumbers.map((pn, i) => (
              <div key={pn} className="ll-result-row">
                <span style={{ color: getPlayerColor(i) }}>
                  {getPlayerName(pn)}
                </span>
                <span>{state!.drinks[pn] ?? 0} drinks</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
