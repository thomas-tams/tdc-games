import type { GameConfig } from './types';
import { MemoryGame } from './memory/MemoryGame';
import { OddOneOut } from './odd-one-out/OddOneOut';

export const games: GameConfig[] = [
  {
    id: 'memory',
    name: 'Memory Match',
    description:
      'Flip cards to find matching pairs. Match the most pairs to win!',
    minPlayers: 2,
    maxPlayers: 4,
    component: MemoryGame,
  },
  {
    id: 'odd-one-out',
    name: 'Odd One Out',
    description:
      'Answer questions, pick your option. The minority drinks! Up to 8 players.',
    minPlayers: 3,
    maxPlayers: 8,
    component: OddOneOut,
  },
];
