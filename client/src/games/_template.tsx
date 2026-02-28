// ============================================================================
// GAME TEMPLATE — Copy this file to create a new game
//
// Steps:
//   1. Copy this file to a new folder: games/your-game/YourGame.tsx
//   2. Fill in each section below
//   3. Add your game to games/registry.ts
// ============================================================================

import { useState } from 'react';
import type { GameProps } from './types';

// === GAME CONFIG ===
// Exported via registry.ts — see that file for name, description, player counts

// === TYPES ===
// Define your game-specific state shape
interface TemplateState {
  message: string;
  turnCount: number;
}

// === INITIAL STATE ===
// Returns the starting state for a new game
function createInitialState(): TemplateState {
  return {
    message: 'Game started!',
    turnCount: 0,
  };
}

// === GAME LOGIC ===
// Pure functions — no side effects, no DOM manipulation

function checkWinCondition(_state: TemplateState): boolean {
  // Return true when the game is over
  return false;
}

// === COMPONENT ===
export function TemplateGame({
  playerNumber,
  currentTurn,
  players,
  onEndTurn,
  onEndGame,
}: GameProps) {
  const [state, setState] = useState<TemplateState>(createInitialState);
  const isMyTurn = playerNumber === currentTurn;

  // === INPUT HANDLING ===
  const handleAction = () => {
    const newState: TemplateState = {
      ...state,
      message: `Player ${currentTurn} did something!`,
      turnCount: state.turnCount + 1,
    };

    setState(newState);

    if (checkWinCondition(newState)) {
      onEndGame(JSON.stringify(newState));
    } else {
      onEndTurn(JSON.stringify(newState));
    }
  };

  // === RENDERING ===
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Template Game</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
        {state.message}
      </p>
      <p style={{ marginBottom: '1.5rem' }}>
        Turn #{state.turnCount + 1} —{' '}
        {isMyTurn ? (
          <span style={{ color: 'var(--primary)' }}>Your turn!</span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>
            Waiting for {players.find((p) => p.playerNumber === currentTurn)?.name}...
          </span>
        )}
      </p>
      <button
        className="btn-primary"
        disabled={!isMyTurn}
        onClick={handleAction}
      >
        Do Something
      </button>
    </div>
  );
}
