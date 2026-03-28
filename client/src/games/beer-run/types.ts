// ============================================================================
// Beer Run — Types, interfaces, and constants
// ============================================================================

export type Phase = 'setup' | 'countdown' | 'playing' | 'finished';
export type SpeedSetting = 'slow' | 'normal' | 'fast';
export type DensitySetting = 'low' | 'medium' | 'high';
export type RampSetting = 'gentle' | 'normal' | 'aggressive';
export type ObstacleType = 'bottle' | 'stool' | 'pothole' | 'ice' | 'pizza';

export interface BeerRunConfig {
  speed: SpeedSetting;
  density: DensitySetting;
  ramp: RampSetting;
}

export const DEFAULT_CONFIG: BeerRunConfig = {
  speed: 'normal',
  density: 'medium',
  ramp: 'normal',
};

export interface Obstacle {
  id: number;
  x: number;
  type: ObstacleType;
  width: number;
  height: number;
}

export interface PlayerState {
  y: number;
  vy: number;
  alive: boolean;
  jumpPressed: boolean;
  eliminatedAt: number;
  deathObstacleType: ObstacleType | null;
}

export interface BeerRunState {
  phase: Phase;
  config: BeerRunConfig;
  obstacles: Obstacle[];
  playerStates: Record<number, PlayerState>;
  scrollSpeed: number;
  gameTime: number;
  spawnTimer: number;
  nextObstacleId: number;
  eliminated: number[];
  winner: number | null;
  countdownEnd: number;
  lastEvent: {
    type: 'eliminate';
    player: number;
    playerName: string;
    obstacleType: ObstacleType;
    timestamp: number;
  } | null;
}

// ============================================================================
// World & physics constants
// ============================================================================

export const WORLD_WIDTH = 1000;
export const GROUND_Y = 0;
export const PLAYER_X = 150;
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 50;

export const GRAVITY = 1200;
export const JUMP_VELOCITY = 800;
export const FAST_FALL_GRAVITY = 2400; // faster falling for snappy Chrome dino feel
export const MAX_FALL_SPEED = -1400;

export const COUNTDOWN_SECONDS = 3;
export const SYNC_INTERVAL = 100;
export const MAX_OBSTACLES = 20;

// ============================================================================
// Config maps
// ============================================================================

export const SPEED_MAP: Record<SpeedSetting, number> = {
  slow: 200,
  normal: 320,
  fast: 450,
};

export const DENSITY_MAP: Record<DensitySetting, number> = {
  low: 2.0,
  medium: 1.3,
  high: 0.8,
};

export const RAMP_MAP: Record<RampSetting, number> = {
  gentle: 0.05,
  normal: 0.10,
  aggressive: 0.18,
};

export const MAX_RAMP_MULTIPLIER = 3.0;
export const MIN_SPAWN_INTERVAL = 0.3;

// ============================================================================
// Obstacle definitions
// ============================================================================

export const OBSTACLE_DEFS: Record<ObstacleType, { emoji: string; width: number; height: number; label: string }> = {
  bottle:  { emoji: '🍾', width: 30, height: 50, label: 'Bottle' },
  stool:   { emoji: '🪑', width: 45, height: 45, label: 'Bar Stool' },
  pothole: { emoji: '🕳️', width: 50, height: 20, label: 'Pothole' },
  ice:     { emoji: '🧊', width: 35, height: 35, label: 'Ice Cube' },
  pizza:   { emoji: '🍕', width: 40, height: 25, label: 'Pizza Box' },
};

export const OBSTACLE_TYPES: ObstacleType[] = ['bottle', 'stool', 'pothole', 'ice', 'pizza'];

// ============================================================================
// Player colors (up to 8)
// ============================================================================

export const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#e67e22', '#1abc9c', '#fd79a8',
];

// ============================================================================
// Death messages — {name} and {obstacle} are replaced at runtime
// ============================================================================

export const DEATH_MESSAGES: string[] = [
  "💀 {name} ate a {obstacle}! DRINK!",
  "💀 {name} wiped out on a {obstacle}! Sip time!",
  "💀 {name} couldn't jump a {obstacle}. Classic.",
  "💀 {name} plays like Emil codes — straight into obstacles.",
  "💀 {name} has the reflexes of a sleepy sloth. DRINK!",
  "💀 {name} thought the {obstacle} was decorative.",
  "💀 {name} tripped! Even Emil would've cleared that one... maybe.",
  "💀 {name} didn't see the {obstacle}. Drink up!",
];

export function getRandomDeathMessage(name: string, obstacleType: ObstacleType): string {
  const msg = DEATH_MESSAGES[Math.floor(Math.random() * DEATH_MESSAGES.length)];
  return msg.replace('{name}', name).replace('{obstacle}', OBSTACLE_DEFS[obstacleType].label);
}
