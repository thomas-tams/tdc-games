// ============================================================================
// Looping Louie — Pure simulation logic (no React dependency)
// ============================================================================

export interface LoopingLouieState {
  phase: 'countdown' | 'playing' | 'finished';
  planeAngle: number;           // 0-360 degrees, position on circular track
  planeSpeed: number;           // degrees/second
  planeHeight: number;          // 0-1, where 0 = ground level (hits chickens)
  planeHeightVelocity: number;  // rate of height change per second
  chickens: Record<number, number>;      // playerNumber -> remaining chickens (0-3)
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
  // Track which zones have been "visited" this revolution to prevent double-hits
  visitedZones: number[];
}

// ============================================================================
// Constants
// ============================================================================

export const CHICKENS_PER_PLAYER = 3;
export const BASE_SPEED = 120;          // degrees/second (~3 seconds per revolution)
export const SPEED_VARIATION = 40;      // +/- random variation
export const SPEED_CHANGE_INTERVAL = 3000; // ms between speed changes
export const GRAVITY = 1.8;             // height decay per second
export const DEFLECT_IMPULSE = 2.5;     // upward impulse from successful paddle
export const MAX_HEIGHT = 1.0;
export const HIT_HEIGHT_THRESHOLD = 0.3; // plane must be below this to hit chickens
export const PADDLE_WINDOW_DEGREES = 20; // +/- degrees from zone center for valid paddle
export const PADDLE_COOLDOWN_MS = 500;   // minimum ms between paddle presses per player
export const COUNTDOWN_SECONDS = 3;

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

/** Angular distance (signed) between two angles */
function angleDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

// ============================================================================
// State creation
// ============================================================================

export function createInitialState(
  playerNumbers: number[],
  now: number
): LoopingLouieState {
  const chickens: Record<number, number> = {};
  const paddlePresses: Record<number, number> = {};
  const drinks: Record<number, number> = {};

  for (const pn of playerNumbers) {
    chickens[pn] = CHICKENS_PER_PLAYER;
    paddlePresses[pn] = 0;
    drinks[pn] = 0;
  }

  return {
    phase: 'countdown',
    planeAngle: 0,
    planeSpeed: BASE_SPEED,
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
    visitedZones: [],
  };
}

// ============================================================================
// Simulation tick (host-authoritative)
// ============================================================================

export function tickSimulation(
  state: LoopingLouieState,
  dt: number,
  playerZones: Record<number, number>,
  now: number
): LoopingLouieState {
  if (state.phase !== 'playing') return state;

  const next = { ...state };

  // Advance plane position
  const prevAngle = next.planeAngle;
  next.planeAngle = (next.planeAngle + next.planeSpeed * dt) % 360;

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
    // Bounce slightly off the ground
    next.planeHeightVelocity = Math.abs(next.planeHeightVelocity) * 0.3;
  }

  // Random speed variation
  if (now >= next.nextSpeedChange) {
    next.planeSpeed = BASE_SPEED + (Math.random() * 2 - 1) * SPEED_VARIATION;
    next.planeSpeed = Math.max(60, Math.min(200, next.planeSpeed));
    next.nextSpeedChange = now + SPEED_CHANGE_INTERVAL;
  }

  // Process paddle presses and zone collisions
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
      // Check for paddle press
      const pressTime = next.paddlePresses[pn];
      if (pressTime > 0) {
        // Valid deflection — paddle was pressed while plane in zone
        next.planeHeightVelocity = DEFLECT_IMPULSE;
        next.planeHeight = Math.max(next.planeHeight, 0.2); // minimum boost
        next.paddlePresses[pn] = 0;
        next.lastEvent = { type: 'deflect', player: pn, timestamp: now };
        // Mark zone as visited (safe)
        if (!next.visitedZones.includes(pn)) {
          next.visitedZones.push(pn);
        }
      } else if (!next.visitedZones.includes(pn) && next.planeHeight < HIT_HEIGHT_THRESHOLD) {
        // Plane is low and no paddle — hit!
        next.chickens[pn] = Math.max(0, next.chickens[pn] - 1);
        next.drinks[pn] = (next.drinks[pn] || 0) + 1;
        next.lastEvent = { type: 'hit', player: pn, timestamp: now };
        next.visitedZones.push(pn);

        // Check elimination
        if (next.chickens[pn] <= 0 && !next.eliminated.includes(pn)) {
          next.eliminated.push(pn);
          next.lastEvent = { type: 'eliminate', player: pn, timestamp: now };
        }
      }
    }

    // Clear visited zone when plane leaves
    if (!inZone && wasInZone) {
      next.visitedZones = next.visitedZones.filter((z) => z !== pn);
    }

    // Clear stale paddle presses (pressed too early, outside zone)
    if (next.paddlePresses[pn] > 0 && !inZone) {
      // If the press is old (> cooldown), clear it
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

  return next;
}
