import { useState, useEffect, useRef, useCallback } from 'react';
import type { GameProps } from '../types';
import './HotPotato.css';

// === TYPES ===
interface HotPotatoConfig {
  timerDuration: number; // seconds: 15, 30, 45, 60
  numPotatoes: 1 | 2;
  numRounds: number;
}

interface RoundResult {
  roundNumber: number;
  explodedPlayers: number[];
}

interface HotPotatoState {
  phase: 'setup' | 'countdown' | 'playing' | 'exploded' | 'results' | 'gameover';
  config: HotPotatoConfig;
  currentRound: number;
  startedAt: number | null;
  countdownValue: number | null; // 3, 2, 1, null
  potatoHolders: number[]; // only host mutates this
  hasSipped: Record<number, boolean>; // each player writes own key
  passRequests: Record<number, number>; // playerNumber -> timestamp; each player writes own key
  roundHistory: RoundResult[];
  explosionCounts: Record<number, number>;
}

const DEFAULT_CONFIG: HotPotatoConfig = {
  timerDuration: 30,
  numPotatoes: 1,
  numRounds: 5,
};

const EXPLODE_DURATION_MS = 3000;

// === HELPERS ===

function createInitialState(): HotPotatoState {
  return {
    phase: 'setup',
    config: { ...DEFAULT_CONFIG },
    currentRound: 1,
    startedAt: null,
    countdownValue: null,
    potatoHolders: [],
    hasSipped: {},
    passRequests: {},
    roundHistory: [],
    explosionCounts: {},
  };
}

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function selectRandomHolders(playerNumbers: number[], count: number): number[] {
  return fisherYatesShuffle(playerNumbers).slice(0, Math.min(count, playerNumbers.length));
}

// === COMPONENT ===
export function HotPotato({
  playerNumber,
  players,
  stateJson,
  onUpdateState,
  onEndGame,
}: GameProps) {
  const stateJsonRef = useRef(stateJson);
  useEffect(() => {
    stateJsonRef.current = stateJson;
  }, [stateJson]);

  const prevHoldersRef = useRef<number[]>([]);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const isHost = playerNumber === Math.min(...players.map((p) => p.playerNumber));

  // Parse state
  let state: HotPotatoState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && parsed.phase) {
      state = parsed as HotPotatoState;
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

  // === HOST: PROCESS PASS REQUESTS ===
  // Host is the sole mutator of potatoHolders, preventing concurrent write conflicts.
  // Players write only their own key in passRequests; host reads and processes them.
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'playing') return;

    const pendingPlayers = Object.keys(state.passRequests).map(Number);
    if (pendingPlayers.length === 0) return;

    const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
    if (current.phase !== 'playing') return;

    let holders = [...current.potatoHolders];
    const sipped = { ...current.hasSipped };
    const allPlayerNums = players.map((p) => p.playerNumber);

    for (const pn of pendingPlayers) {
      if (!holders.includes(pn)) continue;
      if (!sipped[pn]) continue;

      const available = allPlayerNums.filter((n) => !holders.includes(n));
      if (available.length === 0) continue;

      const target = available[Math.floor(Math.random() * available.length)];
      holders = holders.map((h) => (h === pn ? target : h));
      sipped[pn] = false;
    }

    onUpdateState(
      JSON.stringify({
        ...current,
        potatoHolders: holders,
        hasSipped: sipped,
        passRequests: {},
      })
    );
  }, [isHost, state?.phase, state?.passRequests, players, onUpdateState]);

  // === HOST: ORPHANED POTATO DETECTION ===
  // If a player holding a potato disconnects, reassign to a random remaining player.
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'playing') return;

    const activePlayerNums = players.map((p) => p.playerNumber);
    const orphaned = state.potatoHolders.filter((h) => !activePlayerNums.includes(h));
    if (orphaned.length === 0) return;

    const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
    if (current.phase !== 'playing') return;

    let holders = [...current.potatoHolders];
    for (const orphanedPlayer of orphaned) {
      const available = activePlayerNums.filter((n) => !holders.includes(n));
      if (available.length === 0) break;
      const target = available[Math.floor(Math.random() * available.length)];
      holders = holders.map((h) => (h === orphanedPlayer ? target : h));
    }
    // Remove any holders that are still orphaned (no available targets)
    holders = holders.filter((h) => activePlayerNums.includes(h));

    onUpdateState(JSON.stringify({ ...current, potatoHolders: holders }));
  }, [isHost, state?.phase, state?.potatoHolders, players, onUpdateState]);

  // === HOST TIMERS ===

  // Countdown: 3 → 2 → 1 → playing
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'countdown') return;

    const timer = setTimeout(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
      if (current.phase !== 'countdown') return;

      if (current.countdownValue !== null && current.countdownValue > 1) {
        onUpdateState(JSON.stringify({ ...current, countdownValue: current.countdownValue - 1 }));
      } else {
        const allPlayerNums = players.map((p) => p.playerNumber);
        const holders = selectRandomHolders(allPlayerNums, current.config.numPotatoes);
        onUpdateState(
          JSON.stringify({
            ...current,
            phase: 'playing',
            startedAt: Date.now(),
            potatoHolders: holders,
            hasSipped: {},
            passRequests: {},
            countdownValue: null,
          })
        );
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isHost, state?.phase, state?.countdownValue, players, onUpdateState]);

  // Playing: detect timer expiry (host reads latest state from ref)
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'playing' || !state.startedAt) return;

    const interval = setInterval(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
      if (current.phase !== 'playing' || !current.startedAt) return;

      const elapsed = Date.now() - current.startedAt;
      if (elapsed >= current.config.timerDuration * 1000) {
        // Transition to exploded — potatoHolders is already authoritative from host
        onUpdateState(JSON.stringify({ ...current, phase: 'exploded' }));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isHost, state?.phase, state?.startedAt, onUpdateState]);

  // Exploded → results after delay
  useEffect(() => {
    if (!isHost || !state || state.phase !== 'exploded') return;

    const timer = setTimeout(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
      if (current.phase !== 'exploded') return;

      const newCounts = { ...current.explosionCounts };
      for (const holder of current.potatoHolders) {
        newCounts[holder] = (newCounts[holder] || 0) + 1;
      }

      onUpdateState(
        JSON.stringify({
          ...current,
          phase: 'results',
          explosionCounts: newCounts,
          roundHistory: [
            ...current.roundHistory,
            { roundNumber: current.currentRound, explodedPlayers: [...current.potatoHolders] },
          ],
        })
      );
    }, EXPLODE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isHost, state?.phase, onUpdateState]);

  // === LOCAL TIMER DISPLAY ===
  useEffect(() => {
    if (!state || state.phase !== 'playing' || !state.startedAt) {
      setRemainingMs(null);
      return;
    }

    const startedAt = state.startedAt;
    const duration = state.config.timerDuration * 1000;

    const update = () => {
      const elapsed = Date.now() - startedAt;
      setRemainingMs(Math.max(0, duration - elapsed));
    };

    update();
    const interval = setInterval(update, 50);
    return () => clearInterval(interval);
  }, [state?.phase, state?.startedAt, state?.config.timerDuration]);

  // === VIBRATE ON RECEIVE ===
  useEffect(() => {
    if (!state || state.phase !== 'playing') return;

    const hadPotato = prevHoldersRef.current.includes(playerNumber);
    const hasPotato = state.potatoHolders.includes(playerNumber);

    if (!hadPotato && hasPotato && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }

    prevHoldersRef.current = state.potatoHolders;
  }, [state?.potatoHolders, state?.phase, playerNumber]);

  // === HANDLERS ===

  const handleConfigChange = useCallback(
    (key: keyof HotPotatoConfig, value: number) => {
      const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
      if (current.phase !== 'setup') return;
      onUpdateState(
        JSON.stringify({ ...current, config: { ...current.config, [key]: value } })
      );
    },
    [onUpdateState]
  );

  const handleStartGame = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
    if (current.phase !== 'setup') return;
    onUpdateState(JSON.stringify({ ...current, phase: 'countdown', countdownValue: 3 }));
  }, [onUpdateState]);

  // Player writes only their own key — safe for concurrent access
  const handleSip = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
    if (current.phase !== 'playing') return;
    if (!current.potatoHolders.includes(playerNumber)) return;
    if (current.hasSipped[playerNumber]) return;

    onUpdateState(
      JSON.stringify({
        ...current,
        hasSipped: { ...current.hasSipped, [playerNumber]: true },
      })
    );
  }, [playerNumber, onUpdateState]);

  // Player writes only their own key in passRequests — host processes the actual pass
  const handlePass = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
    if (current.phase !== 'playing') return;
    if (!current.potatoHolders.includes(playerNumber)) return;
    if (!current.hasSipped[playerNumber]) return;
    if (current.passRequests[playerNumber]) return; // already pending

    onUpdateState(
      JSON.stringify({
        ...current,
        passRequests: { ...current.passRequests, [playerNumber]: Date.now() },
      })
    );
  }, [playerNumber, onUpdateState]);

  const handleNextRound = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as HotPotatoState;
    if (current.phase !== 'results') return;

    if (current.currentRound >= current.config.numRounds) {
      onEndGame(JSON.stringify({ ...current, phase: 'gameover' }));
      return;
    }

    onUpdateState(
      JSON.stringify({
        ...current,
        phase: 'countdown',
        countdownValue: 3,
        currentRound: current.currentRound + 1,
        potatoHolders: [],
        hasSipped: {},
        passRequests: {},
        startedAt: null,
      })
    );
  }, [onUpdateState, onEndGame]);

  // === RENDERING ===

  if (!state) {
    return (
      <div className="hp-game">
        <div className="hp-waiting">Setting up Hot Potato...</div>
      </div>
    );
  }

  const hasPotato = state.potatoHolders.includes(playerNumber);
  const hasSipped = state.hasSipped[playerNumber] ?? false;
  const hasPendingPass = !!state.passRequests[playerNumber];

  // Timer progress (1 = full, 0 = expired)
  const progress =
    remainingMs !== null ? remainingMs / (state.config.timerDuration * 1000) : 1;
  const remainingSec = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;

  // Potato intensity: calm > 60%, hot 25-60%, very-hot < 25%
  const intensity = progress > 0.6 ? 'calm' : progress > 0.25 ? 'hot' : 'very-hot';

  // Can the 2-potato config work with current player count?
  const twoPotatoesAllowed = players.length >= 3;

  // ---- SETUP PHASE ----
  if (state.phase === 'setup') {
    const effectivePotatoes = state.config.numPotatoes === 2 && !twoPotatoesAllowed
      ? 1
      : state.config.numPotatoes;

    return (
      <div className="hp-game">
        <h2 className="hp-title">Hot Potato</h2>
        <p className="hp-subtitle">Don't get caught holding the potato!</p>

        {isHost ? (
          <div className="hp-setup">
            <div className="hp-setup-option">
              <span className="hp-setup-label">Timer</span>
              <div className="hp-setup-buttons">
                {[15, 30, 45, 60].map((t) => (
                  <button
                    key={t}
                    className={`hp-setup-btn ${state.config.timerDuration === t ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('timerDuration', t)}
                  >
                    {t}s
                  </button>
                ))}
              </div>
            </div>

            <div className="hp-setup-option">
              <span className="hp-setup-label">Potatoes</span>
              <div className="hp-setup-buttons">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    className={`hp-setup-btn ${effectivePotatoes === n ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('numPotatoes', n)}
                    disabled={n === 2 && !twoPotatoesAllowed}
                  >
                    {n === 1 ? 'One' : 'Two'}
                  </button>
                ))}
              </div>
              {!twoPotatoesAllowed && (
                <p className="hp-hint">Need 3+ players for two potatoes</p>
              )}
            </div>

            <div className="hp-setup-option">
              <span className="hp-setup-label">Rounds</span>
              <div className="hp-setup-buttons">
                {[3, 5, 7].map((r) => (
                  <button
                    key={r}
                    className={`hp-setup-btn ${state.config.numRounds === r ? 'selected' : ''}`}
                    onClick={() => handleConfigChange('numRounds', r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn-primary hp-start-btn"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              Start Game
            </button>
            {players.length < 2 && (
              <p className="hp-hint">Need at least 2 players</p>
            )}
          </div>
        ) : (
          <div className="hp-setup hp-setup-waiting">
            <p>Waiting for host to configure...</p>
            <div className="hp-config-preview">
              <span>Timer: {state.config.timerDuration}s</span>
              <span>Potatoes: {effectivePotatoes}</span>
              <span>Rounds: {state.config.numRounds}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- COUNTDOWN PHASE ----
  if (state.phase === 'countdown' && state.countdownValue !== null) {
    return (
      <div className="hp-game">
        <div className="hp-countdown-overlay">
          <div className="hp-countdown-round">Round {state.currentRound}</div>
          <div
            key={state.countdownValue}
            className="hp-countdown-number"
          >
            {state.countdownValue}
          </div>
        </div>
      </div>
    );
  }

  // ---- PLAYING PHASE ----
  if (state.phase === 'playing') {
    return (
      <div className="hp-game">
        {/* Round indicator */}
        <div className="hp-round-info">
          <span>
            Round {state.currentRound} of {state.config.numRounds}
          </span>
        </div>

        {/* Timer bar */}
        <div className="hp-timer">
          <div className="hp-timer-bar">
            <div
              className={`hp-timer-fill ${intensity}`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className={`hp-timer-text ${intensity}`}>
            {remainingSec !== null ? `${remainingSec}s` : ''}
          </span>
        </div>

        {/* Potato area */}
        {hasPotato ? (
          <div className="hp-potato-zone">
            <div className={`hp-potato-shaker ${intensity}`}>
              <div className={`hp-potato ${intensity}`}>
                <span className="hp-potato-emoji">&#x1F954;</span>
              </div>
            </div>
            <p className="hp-potato-label">YOU HAVE THE POTATO!</p>

            {hasPendingPass ? (
              <button className="hp-pass-btn" disabled>
                Passing...
              </button>
            ) : !hasSipped ? (
              <button className="hp-sip-btn" onClick={handleSip}>
                Take a Sip
              </button>
            ) : (
              <button className="hp-pass-btn" onClick={handlePass}>
                PASS IT!
              </button>
            )}
          </div>
        ) : (
          <div className="hp-safe-zone">
            <div className="hp-safe-icon">&#x1F60C;</div>
            <p className="hp-safe-label">You're safe... for now</p>
          </div>
        )}

        {/* Scoreboard */}
        <div className="hp-scoreboard">
          <div className="hp-scores">
            {players.map((p) => {
              const holding = state.potatoHolders.includes(p.playerNumber);
              return (
                <div
                  key={p.playerNumber}
                  className={`hp-player-tag ${holding ? 'holding' : ''}`}
                >
                  <span>{p.name}</span>
                  {holding && <span className="hp-tag-potato">&#x1F954;</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---- EXPLODED PHASE ----
  if (state.phase === 'exploded') {
    return (
      <div className="hp-game">
        {hasPotato ? (
          <div className="hp-jumpscare">
            <div className="hp-boom-text">BOOM!</div>
            <div className="hp-boom-potato">&#x1F4A5;</div>
            <p className="hp-boom-subtitle">You got caught! DRINK!</p>
          </div>
        ) : (
          <div className="hp-safe-explode">
            <div className="hp-safe-big">&#x1F389;</div>
            <p className="hp-safe-explode-text">You survived!</p>
            <p className="hp-exploded-names">
              {state.potatoHolders
                .map((pn) => players.find((p) => p.playerNumber === pn)?.name || `Player ${pn}`)
                .join(' & ')}{' '}
              got caught!
            </p>
          </div>
        )}
      </div>
    );
  }

  // ---- RESULTS PHASE ----
  if (state.phase === 'results') {
    const latestResult = state.roundHistory[state.roundHistory.length - 1];
    const sortedPlayers = [...players].sort((a, b) => {
      const ea = state.explosionCounts[a.playerNumber] || 0;
      const eb = state.explosionCounts[b.playerNumber] || 0;
      return eb - ea;
    });

    return (
      <div className="hp-game">
        <div className="hp-results">
          <div className="hp-round-info">
            Round {state.currentRound} of {state.config.numRounds}
          </div>

          {/* Who exploded this round */}
          {latestResult && (
            <div className="hp-results-exploded">
              <h3>&#x1F4A5; Exploded!</h3>
              <p>
                {latestResult.explodedPlayers
                  .map(
                    (pn) => players.find((p) => p.playerNumber === pn)?.name || `Player ${pn}`
                  )
                  .join(' & ')}
              </p>
            </div>
          )}

          {/* Running scoreboard */}
          <div className="hp-results-board">
            <h4>Explosion Tally</h4>
            <div className="hp-results-rows">
              {sortedPlayers.map((p, i) => {
                const count = state.explosionCounts[p.playerNumber] || 0;
                return (
                  <div key={p.playerNumber} className="hp-results-row">
                    <span className="hp-results-rank">{i + 1}.</span>
                    <span className="hp-results-name">{p.name}</span>
                    <span className="hp-results-count">
                      {count} {count === 1 ? 'boom' : 'booms'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Next round / end */}
          {isHost ? (
            <button className="btn-primary hp-next-btn" onClick={handleNextRound}>
              {state.currentRound >= state.config.numRounds
                ? 'See Final Results'
                : 'Next Round'}
            </button>
          ) : (
            <p className="hp-waiting">Waiting for host...</p>
          )}
        </div>
      </div>
    );
  }

  // ---- GAMEOVER PHASE ----
  if (state.phase === 'gameover') {
    const sortedPlayers = [...players].sort((a, b) => {
      const ea = state.explosionCounts[a.playerNumber] || 0;
      const eb = state.explosionCounts[b.playerNumber] || 0;
      return eb - ea;
    });
    const maxBooms = Math.max(...players.map((p) => state.explosionCounts[p.playerNumber] || 0));
    const minBooms = Math.min(...players.map((p) => state.explosionCounts[p.playerNumber] || 0));

    return (
      <div className="hp-game">
        <div className="hp-gameover">
          <h2>Game Over!</h2>
          <p className="hp-gameover-subtitle">Final explosion tally</p>

          <div className="hp-final-rows">
            {sortedPlayers.map((p, i) => {
              const count = state.explosionCounts[p.playerNumber] || 0;
              const isMost = count === maxBooms && maxBooms > 0;
              const isLeast = count === minBooms && minBooms < maxBooms;
              return (
                <div
                  key={p.playerNumber}
                  className={`hp-final-row ${isMost ? 'most' : ''} ${isLeast ? 'least' : ''}`}
                >
                  <span className="hp-final-rank">{i + 1}.</span>
                  <span className="hp-final-name">{p.name}</span>
                  <span className="hp-final-count">
                    {count} {count === 1 ? 'boom' : 'booms'}
                  </span>
                  {isMost && <span className="hp-final-badge most">Most Explosive</span>}
                  {isLeast && <span className="hp-final-badge least">Survivor</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="hp-game">
      <div className="hp-waiting">Loading...</div>
    </div>
  );
}
