import { useEffect, useRef, useCallback } from 'react';
import type { GameProps } from '../types';
import { QUESTION_POOL, selectQuestionsForGame } from './questions';
import './OddOneOut.css';

// === TYPES ===
interface RoundResult {
  questionId: number;
  choices: Record<number, number>;
  voteCounts: [number, number, number, number];
  drinkers: number[];
  minVoteCount: number;
}

interface OddOneOutState {
  currentRound: number;
  phase: 'choosing' | 'revealing' | 'results' | 'gameover';
  questionPool: number[];
  choices: Record<number, number>;
  roundHistory: RoundResult[];
  totalDrinks: Record<number, number>;
}

const TOTAL_ROUNDS = 5;
const REVEAL_DURATION_MS = 3000;

// === GAME LOGIC ===
function createInitialState(): OddOneOutState {
  return {
    currentRound: 1,
    phase: 'choosing',
    questionPool: selectQuestionsForGame(TOTAL_ROUNDS),
    choices: {},
    roundHistory: [],
    totalDrinks: {},
  };
}

function calculateRoundResult(
  questionId: number,
  choices: Record<number, number>
): RoundResult {
  const voteCounts: [number, number, number, number] = [0, 0, 0, 0];
  for (const optionIndex of Object.values(choices)) {
    voteCounts[optionIndex]++;
  }

  const nonZeroCounts = voteCounts.filter((c) => c > 0);
  const allEqual =
    nonZeroCounts.length > 0 &&
    nonZeroCounts.every((c) => c === nonZeroCounts[0]);

  let drinkers: number[] = [];
  let minVoteCount = 0;

  if (!allEqual && nonZeroCounts.length > 1) {
    minVoteCount = Math.min(...nonZeroCounts);
    const minOptions = voteCounts
      .map((count, idx) => ({ count, idx }))
      .filter(({ count }) => count === minVoteCount)
      .map(({ idx }) => idx);
    drinkers = Object.entries(choices)
      .filter(([, optIdx]) => minOptions.includes(optIdx))
      .map(([playerNum]) => Number(playerNum));
  }

  return { questionId, choices, voteCounts, drinkers, minVoteCount };
}

// === COMPONENT ===
export function OddOneOut({
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

  // Parse state from SpacetimeDB
  let state: OddOneOutState | null = null;
  try {
    const parsed = stateJson ? JSON.parse(stateJson) : null;
    if (parsed && parsed.questionPool) {
      state = parsed as OddOneOutState;
    }
  } catch {
    // Invalid JSON, treat as uninitialized
  }

  // Host initializes state
  useEffect(() => {
    if (isHost && (!stateJson || stateJson === '{}' || stateJson === '')) {
      onUpdateState(JSON.stringify(createInitialState()));
    }
  }, [isHost, stateJson, onUpdateState]);

  // Auto-advance: choosing -> revealing when all players have chosen
  useEffect(() => {
    if (!state || !isHost || state.phase !== 'choosing') return;
    const chosenCount = Object.keys(state.choices).length;
    if (chosenCount >= players.length) {
      const updated: OddOneOutState = { ...state, phase: 'revealing' };
      onUpdateState(JSON.stringify(updated));
    }
  }, [state, isHost, players.length, onUpdateState]);

  // Auto-advance: revealing -> results after timer
  useEffect(() => {
    if (!state || !isHost || state.phase !== 'revealing') return;
    const timer = setTimeout(() => {
      const current = JSON.parse(stateJsonRef.current || '{}') as OddOneOutState;
      if (current.phase !== 'revealing') return;

      const questionId = current.questionPool[current.currentRound - 1];
      const result = calculateRoundResult(questionId, current.choices);
      const newTotalDrinks = { ...current.totalDrinks };
      for (const drinker of result.drinkers) {
        newTotalDrinks[drinker] = (newTotalDrinks[drinker] || 0) + 1;
      }

      const updated: OddOneOutState = {
        ...current,
        phase: 'results',
        roundHistory: [...current.roundHistory, result],
        totalDrinks: newTotalDrinks,
      };
      onUpdateState(JSON.stringify(updated));
    }, REVEAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [state?.phase, state?.currentRound, isHost, onUpdateState]);

  // === HANDLERS ===
  const handleChoice = useCallback(
    (optionIndex: number) => {
      const current = JSON.parse(stateJsonRef.current || '{}') as OddOneOutState;
      if (current.phase !== 'choosing') return;
      if (current.choices[playerNumber] !== undefined) return;
      const updated: OddOneOutState = {
        ...current,
        choices: { ...current.choices, [playerNumber]: optionIndex },
      };
      onUpdateState(JSON.stringify(updated));
    },
    [playerNumber, onUpdateState]
  );

  const handleNextRound = useCallback(() => {
    const current = JSON.parse(stateJsonRef.current || '{}') as OddOneOutState;
    if (current.currentRound >= TOTAL_ROUNDS) {
      const updated: OddOneOutState = { ...current, phase: 'gameover' };
      onEndGame(JSON.stringify(updated));
      return;
    }
    const updated: OddOneOutState = {
      ...current,
      currentRound: current.currentRound + 1,
      phase: 'choosing',
      choices: {},
    };
    onUpdateState(JSON.stringify(updated));
  }, [onUpdateState, onEndGame]);

  // === RENDERING ===
  if (!state) {
    return (
      <div className="odd-game">
        <div className="odd-waiting">Waiting for host to start...</div>
      </div>
    );
  }

  const currentQuestion = QUESTION_POOL[state.questionPool[state.currentRound - 1]];
  const hasChosen = state.choices[playerNumber] !== undefined;
  const myChoice = state.choices[playerNumber];
  const chosenCount = Object.keys(state.choices).length;
  const latestResult =
    state.roundHistory.length > 0
      ? state.roundHistory[state.roundHistory.length - 1]
      : null;

  // Game over screen
  if (state.phase === 'gameover') {
    const sortedPlayers = [...players].sort((a, b) => {
      const dA = state.totalDrinks[a.playerNumber] || 0;
      const dB = state.totalDrinks[b.playerNumber] || 0;
      return dB - dA;
    });
    const maxDrinks = Math.max(
      ...players.map((p) => state.totalDrinks[p.playerNumber] || 0)
    );
    const minDrinks = Math.min(
      ...players.map((p) => state.totalDrinks[p.playerNumber] || 0)
    );

    return (
      <div className="odd-game">
        <div className="odd-game-over">
          <h2>Game Over!</h2>
          <p className="odd-game-over-subtitle">Final drink tally</p>
          <div className="odd-final-scores">
            {sortedPlayers.map((p, i) => {
              const drinks = state.totalDrinks[p.playerNumber] || 0;
              const isTopDrinker = drinks === maxDrinks && maxDrinks > 0;
              const isMostSober = drinks === minDrinks && minDrinks < maxDrinks;
              return (
                <div
                  key={p.playerNumber}
                  className={`odd-final-row ${isTopDrinker ? 'top-drinker' : ''} ${isMostSober ? 'most-sober' : ''}`}
                >
                  <span className="odd-final-rank">{i + 1}.</span>
                  <span className="odd-final-name">{p.name}</span>
                  <span className="odd-final-drinks">
                    {drinks} {drinks === 1 ? 'drink' : 'drinks'}
                  </span>
                  {isTopDrinker && (
                    <span className="odd-final-badge">Most Thirsty</span>
                  )}
                  {isMostSober && (
                    <span className="odd-final-badge">Most Sober</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="odd-game">
      {/* Round indicator */}
      <div className="odd-rounds">
        {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
          <div
            key={i}
            className={`odd-round-dot ${
              i + 1 < state.currentRound
                ? 'completed'
                : i + 1 === state.currentRound
                  ? 'current'
                  : ''
            }`}
          />
        ))}
        <span className="odd-round-label">
          Round {state.currentRound} of {TOTAL_ROUNDS}
        </span>
      </div>

      {/* Question */}
      <div className="odd-question">
        <p className="odd-prompt">{currentQuestion.prompt}</p>
        <div className="odd-options">
          {currentQuestion.options.map((option, idx) => {
            let className = 'odd-option';
            if (state.phase === 'choosing' && myChoice === idx) {
              className += ' selected';
            }
            if (
              (state.phase === 'revealing' || state.phase === 'results') &&
              latestResult
            ) {
              const isMinority = latestResult.drinkers.length > 0 &&
                latestResult.voteCounts[idx] === latestResult.minVoteCount &&
                latestResult.voteCounts[idx] > 0;
              className += isMinority ? ' minority' : ' majority';
              if (myChoice === idx) className += ' selected';
            }
            if (state.phase === 'revealing' && myChoice === idx) {
              className += ' selected';
            }

            return (
              <button
                key={idx}
                className={className}
                onClick={() => handleChoice(idx)}
                disabled={
                  state.phase !== 'choosing' || hasChosen
                }
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {/* Choosing phase: progress */}
      {state.phase === 'choosing' && (
        <div className="odd-progress">
          <span>
            {hasChosen
              ? `Waiting for others... (${chosenCount}/${players.length})`
              : `Choose your answer! (${chosenCount}/${players.length} ready)`}
          </span>
          <div className="odd-progress-bar">
            <div
              className="odd-progress-fill"
              style={{
                width: `${(chosenCount / players.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Revealing phase */}
      {state.phase === 'revealing' && (
        <div className="odd-progress">
          <span>Tallying votes...</span>
        </div>
      )}

      {/* Results phase */}
      {state.phase === 'results' && latestResult && (
        <>
          {/* Vote bars */}
          <div className="odd-vote-bars">
            {currentQuestion.options.map((option, idx) => {
              const count = latestResult.voteCounts[idx];
              const maxVotes = Math.max(...latestResult.voteCounts);
              const isMinority =
                latestResult.drinkers.length > 0 &&
                count === latestResult.minVoteCount &&
                count > 0;
              const barWidth = maxVotes > 0 ? (count / maxVotes) * 100 : 0;

              return (
                <div key={idx} className="odd-vote-row">
                  <span className="odd-vote-label">{option}</span>
                  <div className="odd-vote-bar-track">
                    <div
                      className={`odd-vote-bar-fill ${
                        isMinority
                          ? 'minority'
                          : count > 0
                            ? 'majority'
                            : 'neutral'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="odd-vote-count">
                    {count} {count === 1 ? 'vote' : 'votes'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Drink callout */}
          {latestResult.drinkers.length > 0 ? (
            <div className="odd-drink-callout">
              <h3>DRINK!</h3>
              <p>
                {latestResult.drinkers
                  .map(
                    (pn) =>
                      players.find((p) => p.playerNumber === pn)?.name || `Player ${pn}`
                  )
                  .join(', ')}
              </p>
              <div className="odd-choices-breakdown">
                {players.map((p) => {
                  const choice = latestResult.choices[p.playerNumber];
                  const isDrinker = latestResult.drinkers.includes(p.playerNumber);
                  return (
                    <span
                      key={p.playerNumber}
                      className={`odd-choice-tag ${isDrinker ? 'drinker' : ''}`}
                    >
                      {p.name}: {choice !== undefined ? currentQuestion.options[choice] : '—'}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="odd-drink-callout odd-nobody-drinks">
              <h3>Safe!</h3>
              <p>It's a tie — nobody drinks this round!</p>
            </div>
          )}

          {/* Next round / end game button (host only) */}
          {isHost && (
            <div className="odd-controls">
              <button className="btn-primary" onClick={handleNextRound}>
                {state.currentRound >= TOTAL_ROUNDS
                  ? 'See Final Results'
                  : 'Next Round'}
              </button>
            </div>
          )}
          {!isHost && (
            <div className="odd-progress">
              <span>Waiting for host to continue...</span>
            </div>
          )}
        </>
      )}

      {/* Scoreboard */}
      <div className="odd-scoreboard">
        <h4>Drink Tally</h4>
        <div className="odd-scores">
          {players.map((p) => (
            <div key={p.playerNumber} className="odd-player-score">
              <span className="odd-player-name">{p.name}</span>
              <span className="odd-drink-count">
                {state.totalDrinks[p.playerNumber] || 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
