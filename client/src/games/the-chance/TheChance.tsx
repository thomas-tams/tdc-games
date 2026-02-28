import { useEffect, useRef, useCallback, useState } from 'react';
import type { GameProps } from '../types';
import './TheChance.css';

// === TYPES ===
type TwistType =
  | 'pick-two'
  | 'second-chance'
  | 'double-down'
  | 'double-trouble'
  | 'party-round';

interface TwistInfo {
  type: TwistType;
  icon: string;
  name: string;
  description: string;
}

const TWISTS: TwistInfo[] = [
  {
    type: 'pick-two',
    icon: '\uD83C\uDFAF',
    name: 'Pick Two',
    description: 'Choose 2 numbers — if either matches, you drink!',
  },
  {
    type: 'second-chance',
    icon: '\uD83C\uDF40',
    name: 'Second Chance',
    description: 'If you match, the game re-rolls once. Match again = drink.',
  },
  {
    type: 'double-down',
    icon: '\uD83D\uDC80',
    name: 'Double Down',
    description: 'If you survive, the range drops by 3 extra!',
  },
  {
    type: 'double-trouble',
    icon: '\uD83D\uDD25',
    name: 'Double Trouble',
    description: 'If you match, you drink TWICE!',
  },
  {
    type: 'party-round',
    icon: '\uD83C\uDF89',
    name: 'Party Round',
    description: 'If the guesser matches, EVERYONE drinks!',
  },
];

interface TurnHistoryEntry {
  player: number;
  playerName: string;
  guess: number;
  guess2: number | null;
  gameNumber: number;
  matched: boolean;
  twist: TwistType | null;
}

interface TheChanceState {
  range: number;
  phase: 'guessing' | 'revealing' | 'result';
  twist: TwistType | null;
  guess: number | null;
  guess2: number | null;
  gameNumber: number | null;
  rerollNumber: number | null;
  isReroll: boolean;
  gameOver: boolean;
  roundNumber: number;
  drinkCount: Record<number, number>;
  lastDrinker: number | null;
  allDrink: boolean;
  guesserNumber: number | null;
  turnHistory: TurnHistoryEntry[];
}

const STARTING_RANGE = 10;
const REVEAL_DURATION_MS = 1500;
const RESULT_DURATION_MS = 2500;
const TWIST_CHANCE = 0.4;

// === GAME LOGIC ===
function createInitialState(): TheChanceState {
  return {
    range: STARTING_RANGE,
    phase: 'guessing',
    twist: rollTwist(),
    guess: null,
    guess2: null,
    gameNumber: null,
    rerollNumber: null,
    isReroll: false,
    gameOver: false,
    roundNumber: 1,
    drinkCount: {},
    lastDrinker: null,
    allDrink: false,
    guesserNumber: null,
    turnHistory: [],
  };
}

function rollTwist(): TwistType | null {
  if (Math.random() < TWIST_CHANCE) {
    return TWISTS[Math.floor(Math.random() * TWISTS.length)].type;
  }
  return null;
}

function getTwistInfo(type: TwistType): TwistInfo {
  return TWISTS.find((t) => t.type === type)!;
}

function checkMatch(
  guess: number,
  guess2: number | null,
  gameNumber: number
): boolean {
  return guess === gameNumber || (guess2 !== null && guess2 === gameNumber);
}

// === COMPONENT ===
export function TheChance({
  playerNumber,
  currentTurn,
  players,
  stateJson,
  onUpdateState,
  onEndTurn,
  onEndGame,
}: GameProps) {
  const stateJsonRef = useRef(stateJson);
  useEffect(() => {
    stateJsonRef.current = stateJson;
  }, [stateJson]);

  const [revealDisplay, setRevealDisplay] = useState<number | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isHost = playerNumber === Math.min(...players.map((p) => p.playerNumber));
  const isMyTurn = playerNumber === currentTurn;

  // Parse state
  let state: TheChanceState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && typeof parsed.range === 'number') {
      state = parsed as TheChanceState;
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

  // Reveal animation: cycle random numbers then land on the real one
  useEffect(() => {
    if (!state || state.phase !== 'revealing' || state.gameNumber === null) return;

    setRevealDisplay(null);

    const targetNumber = state.isReroll && state.rerollNumber !== null
      ? state.rerollNumber
      : state.gameNumber;
    const range = state.range;
    let elapsed = 0;
    const interval = 80;
    const duration = REVEAL_DURATION_MS - 200;

    revealTimerRef.current = setInterval(() => {
      elapsed += interval;
      if (elapsed >= duration) {
        setRevealDisplay(targetNumber);
        if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      } else {
        setRevealDisplay(Math.floor(Math.random() * range) + 1);
      }
    }, interval);

    return () => {
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    };
  }, [state?.phase, state?.gameNumber, state?.isReroll, state?.rerollNumber, state?.range]);

  // Auto-advance: revealing → result (active player only)
  useEffect(() => {
    if (!state || state.phase !== 'revealing' || !isMyTurn) return;

    const timer = setTimeout(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as TheChanceState;
      if (current.phase !== 'revealing' || current.gameOver) return;

      const effectiveGameNumber = current.isReroll && current.rerollNumber !== null
        ? current.rerollNumber
        : current.gameNumber!;
      const matched = checkMatch(current.guess!, current.guess2, effectiveGameNumber);

      // Second chance: if matched and this is the first roll, do a re-roll
      if (matched && current.twist === 'second-chance' && !current.isReroll) {
        const rerollNum = Math.floor(Math.random() * current.range) + 1;
        const updated: TheChanceState = {
          ...current,
          isReroll: true,
          rerollNumber: rerollNum,
          // stay in revealing for the re-roll animation
        };
        onUpdateState(JSON.stringify(updated));
        return;
      }

      const drinkerNum = matched ? current.guesserNumber : null;
      const allDrink = matched && current.twist === 'party-round';

      const newDrinkCount = { ...current.drinkCount };
      if (matched) {
        const drinkAmount = current.twist === 'double-trouble' ? 2 : 1;
        if (allDrink) {
          for (const p of players) {
            newDrinkCount[p.playerNumber] = (newDrinkCount[p.playerNumber] || 0) + drinkAmount;
          }
        } else {
          const drinker = current.guesserNumber!;
          newDrinkCount[drinker] = (newDrinkCount[drinker] || 0) + drinkAmount;
        }
      }

      const historyEntry: TurnHistoryEntry = {
        player: current.guesserNumber!,
        playerName: players.find((p) => p.playerNumber === current.guesserNumber)?.name || `Player ${current.guesserNumber}`,
        guess: current.guess!,
        guess2: current.guess2,
        gameNumber: effectiveGameNumber,
        matched,
        twist: current.twist,
      };

      const updated: TheChanceState = {
        ...current,
        phase: 'result',
        lastDrinker: drinkerNum,
        allDrink,
        drinkCount: newDrinkCount,
        turnHistory: [...current.turnHistory, historyEntry],
      };
      onUpdateState(JSON.stringify(updated));
    }, REVEAL_DURATION_MS);

    return () => clearTimeout(timer);
  }, [state?.phase, state?.isReroll, isMyTurn, onUpdateState, players]);

  // Auto-advance: result → next turn (active player only)
  useEffect(() => {
    if (!state || state.phase !== 'result' || !isMyTurn) return;

    const timer = setTimeout(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as TheChanceState;
      if (current.phase !== 'result' || current.gameOver) return;

      const effectiveGameNumber = current.isReroll && current.rerollNumber !== null
        ? current.rerollNumber
        : current.gameNumber!;
      const matched = checkMatch(current.guess!, current.guess2, effectiveGameNumber);

      let newRange: number;
      if (matched) {
        // Reset range on drink
        newRange = STARTING_RANGE;
      } else {
        // Decrease range
        let decrease = 1;
        if (current.twist === 'double-down') decrease = 4; // 1 normal + 3 extra
        newRange = Math.max(2, current.range - decrease);
      }

      const nextState: TheChanceState = {
        ...current,
        range: newRange,
        phase: 'guessing',
        twist: rollTwist(),
        guess: null,
        guess2: null,
        gameNumber: null,
        rerollNumber: null,
        isReroll: false,
        roundNumber: matched ? current.roundNumber + 1 : current.roundNumber,
        lastDrinker: null,
        allDrink: false,
        guesserNumber: null,
      };

      onEndTurn(JSON.stringify(nextState));
    }, RESULT_DURATION_MS);

    return () => clearTimeout(timer);
  }, [state?.phase, isMyTurn, onEndTurn]);

  // Pick Two: track second guess selection
  const [secondGuess, setSecondGuess] = useState<number | null>(null);

  // Reset secondGuess when phase changes
  useEffect(() => {
    if (state?.phase === 'guessing') {
      setSecondGuess(null);
    }
  }, [state?.phase]);

  // === HANDLERS ===
  const handleGuess = useCallback(
    (num: number) => {
      const current = JSON.parse(stateJsonRef.current || '{}') as TheChanceState;
      if (current.phase !== 'guessing') return;

      // Pick Two: need two guesses
      if (current.twist === 'pick-two') {
        if (secondGuess === null) {
          setSecondGuess(num);
          return;
        }
        if (num === secondGuess) {
          setSecondGuess(null); // Deselect first pick
          return;
        }
        // Submit both guesses
        const gameNum = Math.floor(Math.random() * current.range) + 1;
        const updated: TheChanceState = {
          ...current,
          phase: 'revealing',
          guess: secondGuess,
          guess2: num,
          gameNumber: gameNum,
          guesserNumber: playerNumber,
        };
        onUpdateState(JSON.stringify(updated));
        setSecondGuess(null);
        return;
      }

      // Normal guess
      const gameNum = Math.floor(Math.random() * current.range) + 1;
      const updated: TheChanceState = {
        ...current,
        phase: 'revealing',
        guess: num,
        guess2: null,
        gameNumber: gameNum,
        guesserNumber: playerNumber,
      };
      onUpdateState(JSON.stringify(updated));
    },
    [playerNumber, onUpdateState, secondGuess]
  );

  const handleEndGame = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as TheChanceState;
    const updated: TheChanceState = { ...current, gameOver: true };
    onEndGame(JSON.stringify(updated));
  }, [onEndGame]);

  // === RENDERING ===
  if (!state) {
    return (
      <div className="chance-game">
        <div className="chance-waiting">Setting up the table...</div>
      </div>
    );
  }

  // Game Over screen
  if (state.gameOver) {
    const sortedPlayers = [...players].sort((a, b) => {
      const dA = state.drinkCount[a.playerNumber] || 0;
      const dB = state.drinkCount[b.playerNumber] || 0;
      return dB - dA;
    });
    const maxDrinks = Math.max(
      0,
      ...players.map((p) => state.drinkCount[p.playerNumber] || 0)
    );

    return (
      <div className="chance-game">
        <div className="chance-game-over">
          <h2>Game Over!</h2>
          <p className="chance-game-over-sub">
            {state.roundNumber - 1} round{state.roundNumber - 1 !== 1 ? 's' : ''} played
          </p>
          <div className="chance-final-scores">
            {sortedPlayers.map((p, i) => {
              const drinks = state.drinkCount[p.playerNumber] || 0;
              const isTopDrinker = drinks === maxDrinks && maxDrinks > 0;
              return (
                <div
                  key={p.playerNumber}
                  className={`chance-final-row ${isTopDrinker ? 'top-drinker' : ''}`}
                >
                  <span className="chance-final-rank">{i + 1}.</span>
                  <span className="chance-final-name">{p.name}</span>
                  <span className="chance-final-drinks">
                    {drinks} {drinks === 1 ? 'drink' : 'drinks'}
                  </span>
                  {isTopDrinker && (
                    <span className="chance-final-badge">Most Thirsty</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const currentPlayerName =
    players.find((p) => p.playerNumber === currentTurn)?.name || 'Unknown';
  const twistInfo = state.twist ? getTwistInfo(state.twist) : null;
  const dangerLevel = Math.max(0, Math.min(1, 1 - (state.range - 2) / (STARTING_RANGE - 2)));

  // Result phase data
  const lastEntry =
    state.turnHistory.length > 0
      ? state.turnHistory[state.turnHistory.length - 1]
      : null;
  const showDrinkResult = state.phase === 'result' && lastEntry?.matched;
  const showSafeResult = state.phase === 'result' && lastEntry && !lastEntry.matched;

  return (
    <div className="chance-game">
      {/* Odds Display */}
      <div className="chance-header">
        <div className="chance-round">Round {state.roundNumber}</div>
        <div
          className={`chance-odds ${dangerLevel > 0.6 ? 'danger' : dangerLevel > 0.3 ? 'warning' : ''}`}
        >
          <span className="chance-odds-label">Odds</span>
          <span className="chance-odds-value">1 in {state.range}</span>
        </div>
      </div>

      {/* Twist Card */}
      {twistInfo && state.phase === 'guessing' && (
        <div className={`chance-twist twist-${state.twist}`}>
          <span className="chance-twist-icon">{twistInfo.icon}</span>
          <div className="chance-twist-info">
            <span className="chance-twist-name">{twistInfo.name}</span>
            <span className="chance-twist-desc">{twistInfo.description}</span>
          </div>
        </div>
      )}

      {/* Turn indicator */}
      {state.phase === 'guessing' && (
        <div className="chance-turn">
          {isMyTurn ? (
            <>
              <span className="chance-your-turn">Your turn!</span>
              {state.twist === 'pick-two' && secondGuess !== null && (
                <span className="chance-pick-two-hint">
                  First pick: {secondGuess}. Now pick your second number!
                </span>
              )}
              {state.twist === 'pick-two' && secondGuess === null && (
                <span className="chance-pick-two-hint">
                  Pick your first number...
                </span>
              )}
              {state.twist !== 'pick-two' && (
                <span className="chance-pick-hint">Pick a number...</span>
              )}
            </>
          ) : (
            <span className="chance-waiting-turn">
              Waiting for {currentPlayerName}...
            </span>
          )}
        </div>
      )}

      {/* Number Grid (guessing phase) */}
      {state.phase === 'guessing' && (
        <div
          className="chance-grid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(5, state.range)}, 1fr)`,
          }}
        >
          {Array.from({ length: state.range }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              className={`chance-number ${secondGuess === num ? 'selected' : ''}`}
              disabled={!isMyTurn}
              onClick={() => handleGuess(num)}
            >
              {num}
            </button>
          ))}
        </div>
      )}

      {/* Revealing Phase */}
      {state.phase === 'revealing' && (
        <div className="chance-reveal">
          <div className="chance-reveal-guesses">
            <div className="chance-reveal-label">
              {players.find((p) => p.playerNumber === state.guesserNumber)?.name} picked
            </div>
            <div className="chance-reveal-guess">
              {state.guess}
              {state.guess2 !== null && <span> &amp; {state.guess2}</span>}
            </div>
            {state.isReroll && (
              <div className="chance-reroll-label">Second Chance re-roll!</div>
            )}
          </div>
          <div className="chance-reveal-vs">vs</div>
          <div className="chance-reveal-game">
            <div className="chance-reveal-label">The Game says</div>
            <div className={`chance-reveal-number ${revealDisplay !== null ? 'landed' : 'spinning'}`}>
              {revealDisplay ?? '?'}
            </div>
          </div>
        </div>
      )}

      {/* Result Phase */}
      {showDrinkResult && lastEntry && (
        <div className="chance-result chance-drink">
          <h2>{lastEntry.twist === 'double-trouble' ? 'DOUBLE DRINK!' : 'DRINK!'}</h2>
          <p className="chance-result-detail">
            {state.allDrink ? (
              <>Party Round — EVERYONE drinks{lastEntry.twist === 'double-trouble' ? ' TWICE' : ''}!</>
            ) : (
              <>
                {lastEntry.playerName} picked {lastEntry.guess}
                {lastEntry.guess2 !== null && <> &amp; {lastEntry.guess2}</>}
                {' '}— the game said {lastEntry.gameNumber}!
              </>
            )}
          </p>
          <div className="chance-result-sub">
            Range resets to 1 in {STARTING_RANGE}
          </div>
        </div>
      )}

      {showSafeResult && lastEntry && (
        <div className="chance-result chance-safe">
          <h2>Safe!</h2>
          <p className="chance-result-detail">
            {lastEntry.playerName} picked {lastEntry.guess}
            {lastEntry.guess2 !== null && <> &amp; {lastEntry.guess2}</>}
            {' '}— the game said {lastEntry.gameNumber}.
          </p>
          <div className="chance-result-sub">
            Odds tighten to 1 in{' '}
            {Math.max(
              2,
              state.range - (lastEntry.twist === 'double-down' ? 4 : 1)
            )}
          </div>
        </div>
      )}

      {/* Turn History */}
      {state.turnHistory.length > 0 && (
        <div className="chance-history">
          <h4>History</h4>
          <div className="chance-history-list">
            {[...state.turnHistory].reverse().slice(0, 10).map((entry, i) => (
              <div
                key={i}
                className={`chance-history-entry ${entry.matched ? 'matched' : 'safe'}`}
              >
                <span className="chance-history-name">{entry.playerName}</span>
                <span className="chance-history-nums">
                  {entry.guess}
                  {entry.guess2 !== null && <>&amp;{entry.guess2}</>}
                  {' '}vs {entry.gameNumber}
                </span>
                {entry.twist && (
                  <span className="chance-history-twist">
                    {getTwistInfo(entry.twist).icon}
                  </span>
                )}
                <span
                  className={`chance-history-result ${entry.matched ? 'drink' : 'safe'}`}
                >
                  {entry.matched ? 'DRINK' : 'Safe'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drink Tally */}
      <div className="chance-scoreboard">
        <h4>Drink Tally</h4>
        <div className="chance-scores">
          {players.map((p) => (
            <div
              key={p.playerNumber}
              className={`chance-player-score ${p.playerNumber === currentTurn ? 'active' : ''}`}
            >
              <span className="chance-player-name">{p.name}</span>
              <span className="chance-drink-count">
                {state.drinkCount[p.playerNumber] || 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Host end game button */}
      {isHost && (
        <div className="chance-controls">
          <button className="btn-secondary" onClick={handleEndGame}>
            End Game
          </button>
        </div>
      )}
    </div>
  );
}
