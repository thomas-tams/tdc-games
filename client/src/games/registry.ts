import type { GameConfig } from './types';
import { MemoryGame } from './memory/MemoryGame';
import { OddOneOut } from './odd-one-out/OddOneOut';
import { TheChance } from './the-chance/TheChance';
import { HotPotato } from './hot-potato/HotPotato';
import { SoundLimbo } from './sound-limbo/SoundLimbo';
import { LoopingLouie } from './looping-louie/LoopingLouie';
import { LoopingLouieSpectator } from './looping-louie/LoopingLouieSpectator';

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
  {
    id: 'the-chance',
    name: 'The Chance',
    description:
      'Guess a number. If you match the game, you drink! Odds shrink each turn.',
    minPlayers: 2,
    maxPlayers: 8,
    component: TheChance,
  },
  {
    id: 'hot-potato',
    name: 'Hot Potato',
    description:
      'Pass the potato before it explodes! The holder drinks. Played on your phone.',
    minPlayers: 2,
    maxPlayers: 8,
    component: HotPotato,
  },
  {
    id: 'sound-limbo',
    name: 'Sound Limbo',
    description:
      'Control your voice to hit the target zone. Zone shrinks each round — last one standing wins!',
    minPlayers: 2,
    maxPlayers: 8,
    component: SoundLimbo,
  },
  {
    id: 'looping-louie',
    name: 'Looping Louie',
    description:
      'Deflect the plane to protect your chickens! Last one standing wins. Lose a chicken = drink.',
    minPlayers: 2,
    maxPlayers: 4,
    component: LoopingLouie,
    spectatorComponent: LoopingLouieSpectator,
  },
];
