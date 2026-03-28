import { useState, useEffect, useRef, useMemo } from 'react';
import type { GameProps } from '../types';
import {
  type LoopingLouieState,
  getPlayerZones,
} from './simulation';
import './LoopingLouie.css';

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

/**
 * Spectator / TV view for Looping Louie.
 * Large circular display optimized for a shared screen.
 * Read-only — no inputs.
 */
export function LoopingLouieSpectator({
  players,
  stateJson,
}: GameProps) {
  const stateJsonRef = useRef(stateJson);
  useEffect(() => {
    stateJsonRef.current = stateJson;
  }, [stateJson]);

  const [localAngle, setLocalAngle] = useState(0);
  const [localHeight, setLocalHeight] = useState(0.8);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; type: string }>>([]);
  const toastIdRef = useRef(0);
  const lastEventRef = useRef<string | null>(null);

  const playerNumbers = useMemo(
    () => players.map((p) => p.playerNumber).sort((a, b) => a - b),
    [players]
  );

  const playerZones = useMemo(
    () => getPlayerZones(playerNumbers),
    [playerNumbers]
  );

  let state: LoopingLouieState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && parsed.phase) {
      state = parsed as LoopingLouieState;
    }
  } catch {
    // Invalid JSON
  }

  // Smooth animation loop
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

  // Event toasts
  useEffect(() => {
    if (!state?.lastEvent) return;
    const eventKey = `${state.lastEvent.type}-${state.lastEvent.player}-${state.lastEvent.timestamp}`;
    if (eventKey === lastEventRef.current) return;
    lastEventRef.current = eventKey;

    const getPlayerName = (pn: number) =>
      players.find((p) => p.playerNumber === pn)?.name || `P${pn}`;

    let text = '';
    if (state.lastEvent.type === 'hit') {
      text = `🐔 ${getPlayerName(state.lastEvent.player)} lost a chicken! DRINK!`;
    } else if (state.lastEvent.type === 'deflect') {
      text = `🏓 ${getPlayerName(state.lastEvent.player)} deflected!`;
    } else if (state.lastEvent.type === 'eliminate') {
      text = `💀 ${getPlayerName(state.lastEvent.player)} eliminated! FINISH YOUR DRINK!`;
    }

    if (text) {
      const id = ++toastIdRef.current;
      setToasts((prev) => [...prev.slice(-4), { id, text, type: state!.lastEvent!.type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    }
  }, [state?.lastEvent, players]);

  const getPlayerName = (pn: number) =>
    players.find((p) => p.playerNumber === pn)?.name || `P${pn}`;

  if (!state) {
    return (
      <div className="ll-spectator">
        <div className="ll-waiting">Waiting for game to start...</div>
      </div>
    );
  }

  // Countdown
  if (state.phase === 'countdown') {
    const remaining = Math.max(0, Math.ceil((state.countdownEnd - Date.now()) / 1000));
    return (
      <div className="ll-spectator">
        <div className="ll-countdown-overlay ll-spectator-countdown">
          <div className="ll-countdown-title">Looping Louie</div>
          <div className="ll-countdown-number">
            {remaining === 0 ? 'GO!' : remaining}
          </div>
          <div className="ll-spectator-players">
            {playerNumbers.map((pn, i) => (
              <span key={pn} style={{ color: getPlayerColor(i), fontWeight: 700, fontSize: '1.3rem' }}>
                {getPlayerName(pn)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Playing / Finished
  return (
    <div className="ll-spectator">
      {/* Toasts */}
      <div className="ll-spectator-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`ll-spectator-toast ll-toast-${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Large circular track */}
      <div className="ll-spectator-track-container">
        <div className="ll-track ll-spectator-track">
          {/* Zone indicators with player info */}
          {playerNumbers.map((pn, i) => {
            const angle = playerZones[pn];
            const eliminated = state!.eliminated.includes(pn);
            const chickens = state!.chickens[pn] ?? 0;
            const drinks = state!.drinks[pn] ?? 0;
            return (
              <div
                key={pn}
                className={`ll-zone ll-spectator-zone ${eliminated ? 'eliminated' : ''}`}
                style={{
                  '--zone-angle': `${angle}deg`,
                  '--zone-color': getPlayerColor(i),
                } as React.CSSProperties}
              >
                <div className="ll-zone-label ll-spectator-zone-label">
                  <span className="ll-zone-name">{getPlayerName(pn)}</span>
                  <span className="ll-zone-chickens">
                    {Array.from({ length: 3 }).map((_, ci) => (
                      <span key={ci} className={`ll-mini-chicken ${ci >= chickens ? 'lost' : ''}`}>
                        &#x1F414;
                      </span>
                    ))}
                  </span>
                  <span className="ll-zone-drinks">{drinks} drinks</span>
                </div>
              </div>
            );
          })}

          {/* Plane */}
          <div
            className="ll-plane ll-spectator-plane"
            style={{
              '--plane-angle': `${localAngle}deg`,
              '--plane-height': localHeight,
            } as React.CSSProperties}
          >
            &#x2708;
          </div>

          <div className="ll-center" />
        </div>
      </div>

      {/* Game over */}
      {state.phase === 'finished' && (
        <div className="ll-spectator-result">
          <h2>Game Over!</h2>
          {state.winner && (
            <p className="ll-spectator-winner">
              &#x1F3C6; {getPlayerName(state.winner)} wins!
            </p>
          )}
          <div className="ll-spectator-drink-tally">
            {playerNumbers.map((pn, i) => (
              <div key={pn} className="ll-spectator-tally-row">
                <span style={{ color: getPlayerColor(i), fontWeight: 700 }}>
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
