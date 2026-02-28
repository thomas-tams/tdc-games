import { useEffect, useRef, useCallback, useState } from 'react';
import type { GameProps, PlayerInfo } from '../types';
import { useVolumeMeter } from './useVolumeMeter';
import { getZoneForRound, getMaxRounds, isInsideZone, type ZoneConfig } from './zones';
import './SoundLimbo.css';

// === TYPES ===
interface RoundResult {
  passed: boolean;
  bestHoldTime: number;
}

interface RoundHistoryEntry {
  round: number;
  zone: ZoneConfig;
  results: Record<number, RoundResult>;
  eliminated: number[];
}

interface SoundLimboState {
  phase: 'waiting' | 'countdown' | 'performing' | 'result' | 'gameover';
  currentRound: number;
  activePlayerNumber: number;
  zone: ZoneConfig;
  results: Record<number, RoundResult>;
  eliminatedPlayers: number[];
  roundHistory: RoundHistoryEntry[];
  countdownValue: number;
}

const COUNTDOWN_SECONDS = 3;
const RESULT_DISPLAY_MS = 2500;

// === GAME LOGIC ===
function createInitialState(players: PlayerInfo[]): SoundLimboState {
  const firstPlayer = Math.min(...players.map((p) => p.playerNumber));
  const zone = getZoneForRound(1);
  return {
    phase: 'waiting',
    currentRound: 1,
    activePlayerNumber: firstPlayer,
    zone,
    results: {},
    eliminatedPlayers: [],
    roundHistory: [],
    countdownValue: COUNTDOWN_SECONDS,
  };
}

function getNextActivePlayer(
  currentActive: number,
  players: PlayerInfo[],
  eliminatedPlayers: number[]
): number | null {
  const surviving = players
    .map((p) => p.playerNumber)
    .filter((pn) => !eliminatedPlayers.includes(pn))
    .sort((a, b) => a - b);

  const currentIdx = surviving.indexOf(currentActive);
  if (currentIdx === -1 || currentIdx >= surviving.length - 1) return null;
  return surviving[currentIdx + 1];
}

// === COMPONENT ===
export function SoundLimbo({
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

  const isHost = playerNumber === Math.min(...players.map((p) => p.playerNumber));
  const { volume, isListening, error: micError, start: startMic, stop: stopMic } = useVolumeMeter();

  // Local performing state
  const [holdTime, setHoldTime] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const bestHoldRef = useRef(0);
  const performStartRef = useRef<number | null>(null);
  const resultReportedRef = useRef(false);

  // Parse state
  let state: SoundLimboState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && parsed.phase) {
      state = parsed as SoundLimboState;
    }
  } catch {
    // Invalid JSON
  }

  const isMyTurn = state?.activePlayerNumber === playerNumber;

  // Host initializes state
  useEffect(() => {
    if (isHost && (!stateJson || stateJson === '{}' || stateJson === '')) {
      onUpdateState(JSON.stringify(createInitialState(players)));
    }
  }, [isHost, stateJson, onUpdateState, players]);

  // Reset local state when phase changes
  useEffect(() => {
    if (state?.phase === 'waiting' || state?.phase === 'countdown') {
      setHoldTime(0);
      setElapsed(0);
      holdStartRef.current = null;
      bestHoldRef.current = 0;
      performStartRef.current = null;
      resultReportedRef.current = false;
    }
  }, [state?.phase, state?.activePlayerNumber]);

  // Host drives countdown: countdown -> performing
  useEffect(() => {
    if (!state || !isHost || state.phase !== 'countdown') return;

    if (state.countdownValue > 0) {
      const timer = setTimeout(() => {
        const current = JSON.parse(stateJsonRef.current || '{}') as SoundLimboState;
        if (current.phase !== 'countdown') return;
        onUpdateState(
          JSON.stringify({ ...current, countdownValue: current.countdownValue - 1 })
        );
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown finished, start performing
      const timer = setTimeout(() => {
        const current = JSON.parse(stateJsonRef.current || '{}') as SoundLimboState;
        if (current.phase !== 'countdown') return;
        onUpdateState(JSON.stringify({ ...current, phase: 'performing' }));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state?.phase, state?.countdownValue, isHost, onUpdateState]);

  // Active player starts mic when performing begins
  useEffect(() => {
    if (!state || state.phase !== 'performing' || !isMyTurn) return;
    startMic();
    performStartRef.current = Date.now();
    return () => {
      stopMic();
    };
  }, [state?.phase, state?.activePlayerNumber, isMyTurn, startMic, stopMic]);

  // Report result helper
  const reportResult = useCallback(
    (passed: boolean, bestHold: number) => {
      if (resultReportedRef.current) return;
      resultReportedRef.current = true;
      stopMic();

      const current = JSON.parse(stateJsonRef.current || '{}') as SoundLimboState;
      if (current.phase !== 'performing') return;

      const result: RoundResult = { passed, bestHoldTime: Math.round(bestHold * 100) / 100 };
      const updated: SoundLimboState = {
        ...current,
        phase: 'result',
        results: { ...current.results, [playerNumber]: result },
      };
      onUpdateState(JSON.stringify(updated));
    },
    [playerNumber, onUpdateState, stopMic]
  );

  // Active player: track volume and detect zone hold
  useEffect(() => {
    if (!state || state.phase !== 'performing' || !isMyTurn || !isListening) return;

    const zone = state.zone;
    const inside = isInsideZone(volume, zone);

    if (inside) {
      if (!holdStartRef.current) holdStartRef.current = Date.now();
      const held = (Date.now() - holdStartRef.current) / 1000;
      setHoldTime(held);
      bestHoldRef.current = Math.max(bestHoldRef.current, held);

      if (held >= zone.holdDuration) {
        reportResult(true, held);
      }
    } else {
      holdStartRef.current = null;
      setHoldTime(0);
    }
  }, [volume, state?.phase, isMyTurn, isListening, state?.zone, reportResult]);

  // Active player: elapsed time tracking + time limit enforcement
  useEffect(() => {
    if (!state || state.phase !== 'performing' || !isMyTurn) return;

    const interval = setInterval(() => {
      if (!performStartRef.current) return;
      const el = (Date.now() - performStartRef.current) / 1000;
      setElapsed(el);

      const current = JSON.parse(stateJsonRef.current || '{}') as SoundLimboState;
      if (current.phase !== 'performing') {
        clearInterval(interval);
        return;
      }
      if (el >= current.zone.timeLimit) {
        reportResult(false, bestHoldRef.current);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [state?.phase, state?.activePlayerNumber, isMyTurn, reportResult]);

  // Host: after result display, advance to next player or next round
  useEffect(() => {
    if (!state || !isHost || state.phase !== 'result') return;

    const activeResult = state.results[state.activePlayerNumber];
    if (!activeResult) return;

    const timer = setTimeout(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as SoundLimboState;
      if (current.phase !== 'result') return;

      const nextPlayer = getNextActivePlayer(
        current.activePlayerNumber,
        players,
        current.eliminatedPlayers
      );

      if (nextPlayer !== null) {
        // More players this round
        onUpdateState(
          JSON.stringify({
            ...current,
            phase: 'waiting',
            activePlayerNumber: nextPlayer,
          })
        );
      } else {
        // Round complete — determine eliminations
        const newEliminated = [...current.eliminatedPlayers];
        for (const [pnStr, result] of Object.entries(current.results)) {
          const pn = Number(pnStr);
          if (!result.passed && !newEliminated.includes(pn)) {
            newEliminated.push(pn);
          }
        }

        const historyEntry: RoundHistoryEntry = {
          round: current.currentRound,
          zone: current.zone,
          results: { ...current.results },
          eliminated: newEliminated.filter(
            (pn) => !current.eliminatedPlayers.includes(pn)
          ),
        };

        const survivorsAfter = players.filter(
          (p) => !newEliminated.includes(p.playerNumber)
        );

        if (
          survivorsAfter.length <= 1 ||
          current.currentRound >= getMaxRounds()
        ) {
          // Game over
          const finalState: SoundLimboState = {
            ...current,
            phase: 'gameover',
            eliminatedPlayers: newEliminated,
            roundHistory: [...current.roundHistory, historyEntry],
          };
          onEndGame(JSON.stringify(finalState));
        } else {
          // Next round
          const nextRound = current.currentRound + 1;
          const firstSurvivor = Math.min(
            ...survivorsAfter.map((p) => p.playerNumber)
          );
          const nextState: SoundLimboState = {
            ...current,
            phase: 'waiting',
            currentRound: nextRound,
            activePlayerNumber: firstSurvivor,
            zone: getZoneForRound(nextRound),
            results: {},
            eliminatedPlayers: newEliminated,
            roundHistory: [...current.roundHistory, historyEntry],
            countdownValue: COUNTDOWN_SECONDS,
          };
          onUpdateState(JSON.stringify(nextState));
        }
      }
    }, RESULT_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [state?.phase, state?.activePlayerNumber, isHost, players, onUpdateState, onEndGame]);

  // === HANDLERS ===
  const handleReady = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as SoundLimboState;
    if (current.phase !== 'waiting') return;
    onUpdateState(
      JSON.stringify({
        ...current,
        phase: 'countdown',
        countdownValue: COUNTDOWN_SECONDS,
      })
    );
  }, [onUpdateState]);

  // === RENDERING ===
  if (!state) {
    return (
      <div className="limbo-game">
        <div className="limbo-waiting">Waiting for host to start...</div>
      </div>
    );
  }

  const activePlayerName =
    players.find((p) => p.playerNumber === state.activePlayerNumber)?.name ??
    `Player ${state.activePlayerNumber}`;
  const activeResult = state.results[state.activePlayerNumber];

  // Game over screen
  if (state.phase === 'gameover') {
    const sortedByRounds = [...players].sort((a, b) => {
      const aElimRound = state.roundHistory.findIndex((rh) =>
        rh.eliminated.includes(a.playerNumber)
      );
      const bElimRound = state.roundHistory.findIndex((rh) =>
        rh.eliminated.includes(b.playerNumber)
      );
      const aScore = aElimRound === -1 ? 999 : aElimRound;
      const bScore = bElimRound === -1 ? 999 : bElimRound;
      return bScore - aScore;
    });

    const winner = sortedByRounds[0];
    const isWinner = winner?.playerNumber === playerNumber;

    return (
      <div className="limbo-game">
        <div className="limbo-game-over">
          <h2>{isWinner ? 'You Win!' : `${winner?.name} Wins!`}</h2>
          <p className="limbo-game-over-subtitle">
            Survived {state.roundHistory.length} rounds
          </p>
          <div className="limbo-final-scores">
            {sortedByRounds.map((p, i) => {
              const elimRound = state.roundHistory.findIndex((rh) =>
                rh.eliminated.includes(p.playerNumber)
              );
              return (
                <div
                  key={p.playerNumber}
                  className={`limbo-final-row ${i === 0 ? 'winner' : ''}`}
                >
                  <span className="limbo-final-rank">{i + 1}.</span>
                  <span className="limbo-final-name">{p.name}</span>
                  <span className="limbo-final-detail">
                    {elimRound === -1
                      ? 'Survived!'
                      : `Out in round ${elimRound + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="limbo-game">
      {/* Round indicator */}
      <div className="limbo-rounds">
        {Array.from({ length: getMaxRounds() }, (_, i) => (
          <div
            key={i}
            className={`limbo-round-dot ${
              i + 1 < state.currentRound
                ? 'completed'
                : i + 1 === state.currentRound
                  ? 'current'
                  : ''
            }`}
          />
        ))}
        <span className="limbo-round-label">
          Round {state.currentRound} of {getMaxRounds()}
        </span>
      </div>

      {/* Zone preview */}
      <div className="limbo-zone-info">
        <span>
          Target: {state.zone.low}–{state.zone.high}%
        </span>
        <span>Hold: {state.zone.holdDuration}s</span>
        <span>Time: {state.zone.timeLimit}s</span>
      </div>

      {/* Main content area */}
      <div className="limbo-main">
        {/* WAITING phase */}
        {state.phase === 'waiting' && (
          <div className="limbo-phase-waiting">
            <h3>
              {isMyTurn ? 'Your Turn!' : `${activePlayerName}'s Turn`}
            </h3>
            <p className="limbo-instruction">
              {isMyTurn
                ? 'Hit the target zone with your voice and hold it steady.'
                : `Waiting for ${activePlayerName} to get ready...`}
            </p>
            {isMyTurn && (
              <button className="btn-primary limbo-ready-btn" onClick={handleReady}>
                Ready!
              </button>
            )}
            {micError && isMyTurn && (
              <p className="limbo-error">{micError}</p>
            )}
          </div>
        )}

        {/* COUNTDOWN phase */}
        {state.phase === 'countdown' && (
          <div className="limbo-phase-countdown">
            <div className="limbo-countdown-number">
              {state.countdownValue > 0 ? state.countdownValue : 'GO!'}
            </div>
          </div>
        )}

        {/* PERFORMING phase */}
        {state.phase === 'performing' && (
          <div className="limbo-phase-performing">
            {isMyTurn ? (
              <>
                <div className="limbo-meter-container">
                  {/* Volume meter */}
                  <div className="limbo-meter">
                    <div
                      className="limbo-meter-zone"
                      style={{
                        bottom: `${state.zone.low}%`,
                        height: `${state.zone.high - state.zone.low}%`,
                      }}
                    />
                    <div
                      className={`limbo-meter-fill ${
                        isInsideZone(volume, state.zone) ? 'in-zone' : 'out-zone'
                      }`}
                      style={{ height: `${volume}%` }}
                    />
                    <div className="limbo-meter-label limbo-meter-label-high">
                      {state.zone.high}
                    </div>
                    <div
                      className="limbo-meter-label limbo-meter-label-low"
                      style={{ bottom: `${state.zone.low}%` }}
                    >
                      {state.zone.low}
                    </div>
                  </div>

                  {/* Hold progress */}
                  <div className="limbo-hold-info">
                    <div className="limbo-hold-bar-track">
                      <div
                        className="limbo-hold-bar-fill"
                        style={{
                          width: `${Math.min(100, (holdTime / state.zone.holdDuration) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="limbo-hold-label">
                      {holdTime.toFixed(1)}s / {state.zone.holdDuration}s held
                    </span>
                  </div>
                </div>

                {/* Timer */}
                <div className="limbo-timer">
                  <span
                    className={
                      elapsed > state.zone.timeLimit - 3 ? 'limbo-timer-urgent' : ''
                    }
                  >
                    {Math.max(0, state.zone.timeLimit - elapsed).toFixed(1)}s
                  </span>
                </div>
              </>
            ) : (
              <div className="limbo-spectator">
                <h3>{activePlayerName} is performing...</h3>
                <div className="limbo-spectator-pulse" />
              </div>
            )}
          </div>
        )}

        {/* RESULT phase */}
        {state.phase === 'result' && activeResult && (
          <div className="limbo-phase-result">
            <div
              className={`limbo-result-card ${
                activeResult.passed ? 'passed' : 'failed'
              }`}
            >
              <h3>{activeResult.passed ? 'SAFE!' : 'OUT!'}</h3>
              <p className="limbo-result-name">{activePlayerName}</p>
              <p className="limbo-result-detail">
                {activeResult.passed
                  ? `Held for ${activeResult.bestHoldTime}s`
                  : `Best hold: ${activeResult.bestHoldTime}s`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Player list */}
      <div className="limbo-players">
        <h4>Players</h4>
        <div className="limbo-player-list">
          {players.map((p) => {
            const elim = state.eliminatedPlayers.includes(p.playerNumber);
            const active = p.playerNumber === state.activePlayerNumber;
            const roundResult = state.results[p.playerNumber];
            return (
              <div
                key={p.playerNumber}
                className={`limbo-player ${elim ? 'eliminated' : ''} ${
                  active && state.phase !== 'result' && state.phase !== 'gameover'
                    ? 'active'
                    : ''
                }`}
              >
                <span className="limbo-player-name">
                  {p.name}
                  {p.playerNumber === playerNumber && ' (you)'}
                </span>
                {elim && <span className="limbo-player-status">OUT</span>}
                {!elim && roundResult && (
                  <span
                    className={`limbo-player-status ${
                      roundResult.passed ? 'passed' : 'failed'
                    }`}
                  >
                    {roundResult.passed ? 'SAFE' : 'OUT'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
