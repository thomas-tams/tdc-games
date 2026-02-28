import { useState, useCallback } from 'react';
import type { GameProps } from '../types';
import './MemoryGame.css';

// === TYPES ===
interface Card {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

interface MemoryState {
  cards: Card[];
  flippedIds: number[]; // Currently flipped (max 2)
  scores: Record<number, number>; // playerNumber -> matches
  isChecking: boolean; // Brief lock while checking a pair
}

// === INITIAL STATE ===
const EMOJIS = ['🐶', '🐱', '🐸', '🦊', '🐻', '🐼', '🐨', '🦁'];

function createInitialState(): MemoryState {
  // Create pairs and shuffle
  const pairs = [...EMOJIS, ...EMOJIS];
  const shuffled = pairs
    .map((emoji, i) => ({ emoji, sort: Math.random(), id: i }))
    .sort((a, b) => a.sort - b.sort)
    .map((item, index) => ({
      id: index,
      emoji: item.emoji,
      flipped: false,
      matched: false,
    }));

  return {
    cards: shuffled,
    flippedIds: [],
    scores: {},
    isChecking: false,
  };
}

// === GAME LOGIC ===
function checkAllMatched(cards: Card[]): boolean {
  return cards.every((card) => card.matched);
}

function getWinner(scores: Record<number, number>): number | null {
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;
  const maxScore = Math.max(...entries.map(([, s]) => s));
  const winners = entries.filter(([, s]) => s === maxScore);
  return winners.length === 1 ? Number(winners[0][0]) : null; // null = tie
}

// === COMPONENT ===
export function MemoryGame({
  playerNumber,
  currentTurn,
  players,
  onEndTurn,
  onEndGame,
}: GameProps) {
  const [state, setState] = useState<MemoryState>(createInitialState);
  const isMyTurn = playerNumber === currentTurn;

  // === INPUT HANDLING ===
  const handleCardClick = useCallback(
    (cardId: number) => {
      if (!isMyTurn || state.isChecking) return;

      const card = state.cards[cardId];
      if (card.flipped || card.matched) return;

      setState((prev) => {
        const newCards = prev.cards.map((c) =>
          c.id === cardId ? { ...c, flipped: true } : c
        );
        const newFlippedIds = [...prev.flippedIds, cardId];

        // First card flipped
        if (newFlippedIds.length === 1) {
          return { ...prev, cards: newCards, flippedIds: newFlippedIds };
        }

        // Second card flipped — check for match
        const [firstId, secondId] = newFlippedIds;
        const firstCard = newCards[firstId];
        const secondCard = newCards[secondId];
        const isMatch = firstCard.emoji === secondCard.emoji;

        if (isMatch) {
          // Mark matched
          const matchedCards = newCards.map((c) =>
            c.id === firstId || c.id === secondId
              ? { ...c, matched: true }
              : c
          );
          const newScores = {
            ...prev.scores,
            [currentTurn]: (prev.scores[currentTurn] || 0) + 1,
          };

          const newState: MemoryState = {
            cards: matchedCards,
            flippedIds: [],
            scores: newScores,
            isChecking: false,
          };

          // Check if all matched
          if (checkAllMatched(matchedCards)) {
            setTimeout(() => onEndGame(JSON.stringify(newState)), 500);
          }

          // Player gets another turn on match — don't end turn
          return newState;
        }

        // No match — flip back after delay, then end turn
        const checkingState: MemoryState = {
          ...prev,
          cards: newCards,
          flippedIds: newFlippedIds,
          isChecking: true,
        };

        setTimeout(() => {
          setState((s) => {
            const resetCards = s.cards.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, flipped: false }
                : c
            );
            const newState: MemoryState = {
              ...s,
              cards: resetCards,
              flippedIds: [],
              isChecking: false,
            };
            onEndTurn(JSON.stringify(newState));
            return newState;
          });
        }, 800);

        return checkingState;
      });
    },
    [isMyTurn, state.isChecking, currentTurn, onEndTurn, onEndGame]
  );

  // === RENDERING ===
  const allMatched = checkAllMatched(state.cards);
  const winner = allMatched ? getWinner(state.scores) : null;

  return (
    <div className="memory-game">
      {/* Status */}
      <div className="memory-status">
        {allMatched ? (
          <span className="memory-winner">
            {winner
              ? `${players.find((p) => p.playerNumber === winner)?.name} wins!`
              : "It's a tie!"}
          </span>
        ) : isMyTurn ? (
          <span className="memory-your-turn">Your turn — flip a card!</span>
        ) : (
          <span className="memory-waiting">
            Waiting for {players.find((p) => p.playerNumber === currentTurn)?.name}...
          </span>
        )}
      </div>

      {/* Scores */}
      <div className="memory-scores">
        {players.map((p) => (
          <div
            key={p.playerNumber}
            className={`memory-score ${p.playerNumber === currentTurn ? 'active' : ''}`}
          >
            <span className="memory-score-name">{p.name}</span>
            <span className="memory-score-value">
              {state.scores[p.playerNumber] || 0}
            </span>
          </div>
        ))}
      </div>

      {/* Card Grid */}
      <div className="memory-grid">
        {state.cards.map((card) => (
          <button
            key={card.id}
            className={`memory-card ${card.flipped ? 'flipped' : ''} ${card.matched ? 'matched' : ''}`}
            onClick={() => handleCardClick(card.id)}
            disabled={!isMyTurn || state.isChecking || card.flipped || card.matched}
          >
            <div className="memory-card-inner">
              <div className="memory-card-front">?</div>
              <div className="memory-card-back">{card.emoji}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
