import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GameProps } from '../types';
import {
  type LoopingLouieState,
  createInitialState,
  tickSimulation,
  getPlayerZones,
  isPlaneInZone,
  COUNTDOWN_SECONDS,
} from './simulation';
import './LoopingLouie.css';

// Player colors for zones
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
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

  // My zone angle
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
      const initial = createInitialState(playerNumbers, Date.now());
      onUpdateState(JSON.stringify(initial));
    }
  }, [isHost, stateJson, onUpdateState, playerNumbers]);

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
    const SYNC_INTERVAL = 100; // ms

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Cap dt to prevent huge jumps after tab switch
      const clampedDt = Math.min(dt, 0.1);

      const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
      if (current.phase !== 'playing') return;

      const newState = tickSimulation(current, clampedDt, playerZones, Date.now());

      // Check for game end
      if (newState.phase === 'finished') {
        onEndGame(JSON.stringify(newState));
        return;
      }

      // Throttled sync
      if (now - lastSync >= SYNC_INTERVAL) {
        onUpdateState(JSON.stringify(newState));
        lastSync = now;
      }

      rafId = requestAnimationFrame(frame);
    };

    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [isHost, state?.phase, playerZones, onUpdateState, onEndGame]);

  // === ALL: Local interpolation for smooth animation ===
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

  // === PADDLE HANDLER ===
  const handlePaddle = useCallback(() => {
    if (isSpectator) return;
    const current = JSON.parse(stateJsonRef.current || '{}') as LoopingLouieState;
    if (current.phase !== 'playing') return;
    if (current.eliminated?.includes(playerNumber)) return;

    // Set paddle press timestamp
    onUpdateState(
      JSON.stringify({
        ...current,
        paddlePresses: { ...current.paddlePresses, [playerNumber]: Date.now() },
      })
    );

    // Visual feedback
    setPaddleFlash(true);
    setTimeout(() => setPaddleFlash(false), 200);

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }, [playerNumber, isSpectator, onUpdateState]);

  // === RENDERING ===

  if (!state) {
    return (
      <div className="ll-game">
        <div className="ll-waiting">Setting up Looping Louie...</div>
      </div>
    );
  }

  const isEliminated = state.eliminated.includes(playerNumber);
  const myChickens = state.chickens[playerNumber] ?? 0;
  const planeApproaching = isPlaneInZone(localAngle, myZoneAngle);
  const planeNearby = (() => {
    // Show warning when plane is within 40 degrees
    const diff = ((localAngle - myZoneAngle + 540) % 360) - 180;
    return Math.abs(diff) <= 40;
  })();

  // Find player name by number
  const getPlayerName = (pn: number) =>
    players.find((p) => p.playerNumber === pn)?.name || `P${pn}`;

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

  // === PLAYING ===
  if (state.phase === 'playing' || state.phase === 'finished') {
    const showResult = state.phase === 'finished';

    return (
      <div className="ll-game">
        {/* Event toast */}
        {state.lastEvent && Date.now() - state.lastEvent.timestamp < 2000 && (
          <div className={`ll-toast ll-toast-${state.lastEvent.type}`}>
            {state.lastEvent.type === 'hit' && (
              <>&#x1F414; {getPlayerName(state.lastEvent.player)} lost a chicken! DRINK!</>
            )}
            {state.lastEvent.type === 'deflect' && (
              <>&#x1F3D3; {getPlayerName(state.lastEvent.player)} deflected!</>
            )}
            {state.lastEvent.type === 'eliminate' && (
              <>&#x1F480; {getPlayerName(state.lastEvent.player)} is out! FINISH YOUR DRINK!</>
            )}
          </div>
        )}

        {/* Circular track minimap */}
        <div className="ll-track-container">
          <div className="ll-track">
            {/* Zone indicators */}
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
                    <span className="ll-zone-chickens">
                      {'&#x1F414;'.repeat(chickens)}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Plane */}
            <div
              className="ll-plane"
              style={{
                '--plane-angle': `${localAngle}deg`,
                '--plane-height': localHeight,
              } as React.CSSProperties}
            >
              &#x2708;
            </div>

            {/* Center dot */}
            <div className="ll-center" />
          </div>
        </div>

        {/* My chickens */}
        <div className="ll-my-chickens">
          <div className="ll-chicken-row">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className={`ll-chicken ${i >= myChickens ? 'lost' : ''}`}
              >
                &#x1F414;
              </span>
            ))}
          </div>
          {isEliminated && (
            <div className="ll-eliminated-text">You're out!</div>
          )}
        </div>

        {/* Drink counter */}
        <div className="ll-drinks">
          Drinks: {state.drinks[playerNumber] ?? 0}
        </div>

        {/* Paddle button */}
        {!showResult && !isEliminated && !isSpectator && (
          <button
            className={`ll-paddle-btn ${planeApproaching ? 'in-zone' : planeNearby ? 'approaching' : ''} ${paddleFlash ? 'flash' : ''}`}
            onPointerDown={handlePaddle}
          >
            {planeApproaching ? 'NOW!' : planeNearby ? 'Get ready...' : 'PADDLE'}
          </button>
        )}

        {/* Game over overlay */}
        {showResult && (
          <div className="ll-result-overlay">
            <h2 className="ll-result-title">Game Over!</h2>
            {state.winner && (
              <p className="ll-result-winner">
                &#x1F3C6; {getPlayerName(state.winner)} wins!
              </p>
            )}
            <div className="ll-result-drinks">
              <h3>Drink Tally</h3>
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

  return (
    <div className="ll-game">
      <div className="ll-waiting">Loading...</div>
    </div>
  );
}
