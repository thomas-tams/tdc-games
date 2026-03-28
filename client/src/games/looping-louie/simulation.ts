// ============================================================================
// Looping Louie — Pure simulation logic (no React dependency)
// ============================================================================

export interface LoopingLouieConfig {
  speed: 'slow' | 'normal' | 'fast';
  chickensPerPlayer: 3 | 5;
  chaosMode: boolean;
}

export const DEFAULT_CONFIG: LoopingLouieConfig = {
  speed: 'normal',
  chickensPerPlayer: 3,
  chaosMode: false,
};

export interface LoopingLouieState {
  phase: 'setup' | 'countdown' | 'playing' | 'finished';
  config: LoopingLouieConfig;
  planeAngle: number;           // 0-360 degrees, position on circular track
  planeSpeed: number;           // degrees/second
  planeHeight: number;          // 0-1, where 0 = ground level (hits chickens)
  planeHeightVelocity: number;  // rate of height change per second
  chickens: Record<number, number>;      // playerNumber -> remaining chickens
  paddlePresses: Record<number, number>; // playerNumber -> timestamp (0 = not pressed)
  eliminated: number[];
  winner: number | null;
  lastEvent: {
    type: 'deflect' | 'hit' | 'eliminate';
    player: number;
    timestamp: number;
  } | null;
  drinks: Record<number, number>;
  countdownEnd: number;
  nextSpeedChange: number;      // timestamp for next random speed variation
  nextChaosEvent: number;       // timestamp for next chaos event
  // Track which zones have been "visited" this revolution to prevent double-hits
  visitedZones: number[];
}

// ============================================================================
// Constants
// ============================================================================

export const SPEED_MAP: Record<LoopingLouieConfig['speed'], number> = {
  slow: 150,
  normal: 240,
  fast: 340,
};

export const SPEED_VARIATION = 60;       // +/- random variation
export const SPEED_CHANGE_INTERVAL = 2500; // ms between speed changes
export const GRAVITY = 2.5;              // height decay per second
export const DEFLECT_IMPULSE = 3.0;      // upward impulse from successful paddle
export const MAX_HEIGHT = 1.0;
export const HIT_HEIGHT_THRESHOLD = 0.35; // plane must be below this to hit chickens
export const PADDLE_WINDOW_DEGREES = 25;  // +/- degrees from zone center for valid paddle
export const PADDLE_COOLDOWN_MS = 500;    // minimum ms between paddle presses per player
export const COUNTDOWN_SECONDS = 3;
export const CHAOS_EVENT_INTERVAL = 5000; // ms between chaos events

// ============================================================================
// Zone helpers
// ============================================================================

/** Get the center angle for each player's zone, evenly distributed */
export function getPlayerZones(playerNumbers: number[]): Record<number, number> {
  const step = 360 / playerNumbers.length;
  const zones: Record<number, number> = {};
  playerNumbers.forEach((pn, i) => {
    zones[pn] = i * step;
  });
  return zones;
}

/** Check if the plane is within a player's zone (angular proximity) */
export function isPlaneInZone(planeAngle: number, zoneCenterAngle: number): boolean {
  const diff = ((planeAngle - zoneCenterAngle + 540) % 360) - 180;
  return Math.abs(diff) <= PADDLE_WINDOW_DEGREES;
}

// ============================================================================
// State creation
// ============================================================================

export function createInitialState(): LoopingLouieState {
  return {
    phase: 'setup',
    config: { ...DEFAULT_CONFIG },
    planeAngle: 0,
    planeSpeed: 0,
    planeHeight: 0.8,
    planeHeightVelocity: 0,
    chickens: {},
    paddlePresses: {},
    eliminated: [],
    winner: null,
    lastEvent: null,
    drinks: {},
    countdownEnd: 0,
    nextSpeedChange: 0,
    nextChaosEvent: 0,
    visitedZones: [],
  };
}

/** Transition from setup → countdown, initializing player data */
export function startGame(
  state: LoopingLouieState,
  playerNumbers: number[],
  now: number
): LoopingLouieState {
  const chickens: Record<number, number> = {};
  const paddlePresses: Record<number, number> = {};
  const drinks: Record<number, number> = {};

  for (const pn of playerNumbers) {
    chickens[pn] = state.config.chickensPerPlayer;
    paddlePresses[pn] = 0;
    drinks[pn] = 0;
  }

  const baseSpeed = SPEED_MAP[state.config.speed];

  return {
    ...state,
    phase: 'countdown',
    planeAngle: 0,
    planeSpeed: baseSpeed,
    planeHeight: 0.8,
    planeHeightVelocity: 0,
    chickens,
    paddlePresses,
    eliminated: [],
    winner: null,
    lastEvent: null,
    drinks,
    countdownEnd: now + COUNTDOWN_SECONDS * 1000,
    nextSpeedChange: now + SPEED_CHANGE_INTERVAL,
    nextChaosEvent: now + CHAOS_EVENT_INTERVAL,
    visitedZones: [],
  };
}

// ============================================================================
// Simulation tick (host-authoritative)
// ============================================================================

/**
 * Run one tick of the simulation.
 * @param isHost - Only the host processes random events (speed changes, chaos),
 *                 zone collisions, and win conditions. Non-host clients run
 *                 physics locally for prediction.
 */
export function tickSimulation(
  state: LoopingLouieState,
  dt: number,
  playerZones: Record<number, number>,
  now: number,
  isHost = true
): LoopingLouieState {
  if (state.phase !== 'playing') return state;

  const baseSpeed = SPEED_MAP[state.config.speed];
  const next = { ...state };

  // Advance plane position
  const prevAngle = next.planeAngle;
  next.planeAngle = (next.planeAngle + next.planeSpeed * dt + 360) % 360;

  // Apply gravity to height
  next.planeHeightVelocity -= GRAVITY * dt;
  next.planeHeight += next.planeHeightVelocity * dt;

  // Clamp height
  if (next.planeHeight > MAX_HEIGHT) {
    next.planeHeight = MAX_HEIGHT;
    next.planeHeightVelocity = Math.min(next.planeHeightVelocity, 0);
  }
  if (next.planeHeight < 0) {
    next.planeHeight = 0;
    next.planeHeightVelocity = Math.abs(next.planeHeightVelocity) * 0.3;
  }

  // Random speed variation (host only — randomness must be authoritative)
  if (isHost && now >= next.nextSpeedChange) {
    next.planeSpeed = baseSpeed + (Math.random() * 2 - 1) * SPEED_VARIATION;
    next.planeSpeed = Math.max(baseSpeed * 0.5, Math.min(baseSpeed * 1.5, next.planeSpeed));
    next.nextSpeedChange = now + SPEED_CHANGE_INTERVAL;
  }

  // Chaos mode events (host only)
  if (isHost && state.config.chaosMode && now >= next.nextChaosEvent) {
    const event = Math.random();
    if (event < 0.3) {
      next.planeSpeed = -next.planeSpeed;
    } else if (event < 0.6) {
      next.planeSpeed = next.planeSpeed * 1.8;
    }
    next.nextChaosEvent = now + CHAOS_EVENT_INTERVAL + Math.random() * 3000;
  }

  // Zone collisions and paddle processing (host only — authoritative)
  if (isHost) {
    const activePlayers = Object.keys(playerZones)
      .map(Number)
      .filter((pn) => !next.eliminated.includes(pn));

    // Copy mutable fields
    next.chickens = { ...next.chickens };
    next.paddlePresses = { ...next.paddlePresses };
    next.drinks = { ...next.drinks };
    next.eliminated = [...next.eliminated];
    next.visitedZones = [...next.visitedZones];

    for (const pn of activePlayers) {
      const zoneAngle = playerZones[pn];
      const inZone = isPlaneInZone(next.planeAngle, zoneAngle);
      const wasInZone = isPlaneInZone(prevAngle, zoneAngle);

      if (inZone) {
        const pressTime = next.paddlePresses[pn];
        if (pressTime > 0) {
          next.planeHeightVelocity = DEFLECT_IMPULSE;
          next.planeHeight = Math.max(next.planeHeight, 0.2);
          next.paddlePresses[pn] = 0;
          next.lastEvent = { type: 'deflect', player: pn, timestamp: now };
          if (!next.visitedZones.includes(pn)) {
            next.visitedZones.push(pn);
          }
        } else if (!next.visitedZones.includes(pn) && next.planeHeight < HIT_HEIGHT_THRESHOLD) {
          next.chickens[pn] = Math.max(0, next.chickens[pn] - 1);
          next.drinks[pn] = (next.drinks[pn] || 0) + 1;
          next.lastEvent = { type: 'hit', player: pn, timestamp: now };
          next.visitedZones.push(pn);

          if (next.chickens[pn] <= 0 && !next.eliminated.includes(pn)) {
            next.eliminated.push(pn);
            next.lastEvent = { type: 'eliminate', player: pn, timestamp: now };
          }
        }
      }

      if (!inZone && wasInZone) {
        next.visitedZones = next.visitedZones.filter((z) => z !== pn);
      }

      if (next.paddlePresses[pn] > 0 && !inZone) {
        if (now - next.paddlePresses[pn] > PADDLE_COOLDOWN_MS) {
          next.paddlePresses[pn] = 0;
        }
      }
    }

    // Check for winner
    const alive = activePlayers.filter((pn) => !next.eliminated.includes(pn));
    if (alive.length <= 1) {
      next.phase = 'finished';
      next.winner = alive[0] ?? null;
    }
  }

  return next;
}
