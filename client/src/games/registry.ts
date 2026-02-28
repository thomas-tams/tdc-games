import type { GameConfig } from './types';
import { MemoryGame } from './memory/MemoryGame';

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
  // To add a new game:
  // 1. Create a folder: games/your-game/YourGame.tsx (copy _template.tsx)
  // 2. Import it here and add an entry to this array
];
