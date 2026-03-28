// ============================================================================
// Beer Run — Pure simulation logic (no React dependency)
// ============================================================================

import {
  type BeerRunState,
  type BeerRunConfig,
  type PlayerState,
  type Obstacle,
  type ObstacleType,
  DEFAULT_CONFIG,
  WORLD_WIDTH,
  PLAYER_X,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  MAX_FALL_SPEED,
  SPEED_MAP,
  DENSITY_MAP,
  RAMP_MAP,
  MAX_RAMP_MULTIPLIER,
  MIN_SPAWN_INTERVAL,
  MAX_OBSTACLES,
  OBSTACLE_TYPES,
  OBSTACLE_DEFS,
  COUNTDOWN_SECONDS,
} from './types';

// ============================================================================
// State creation
// ============================================================================

export function createInitialState(): BeerRunState {
  return {
    phase: 'setup',
    config: { ...DEFAULT_CONFIG },
    obstacles: [],
    playerStates: {},
    scrollSpeed: 0,
    gameTime: 0,
    spawnTimer: 0,
    nextObstacleId: 1,
    eliminated: [],
    winner: null,
    countdownEnd: 0,
    lastEvent: null,
  };
}

export function startGame(
  state: BeerRunState,
  playerNumbers: number[],
  now: number
): BeerRunState {
  const playerStates: Record<number, PlayerState> = {};
  for (const pn of playerNumbers) {
    playerStates[pn] = {
      y: 0,
      vy: 0,
      alive: true,
      jumpPressed: false,
      eliminatedAt: 0,
      deathObstacleType: null,
    };
  }

  return {
    ...state,
    phase: 'countdown',
    obstacles: [],
    playerStates,
    scrollSpeed: SPEED_MAP[state.config.speed],
    gameTime: 0,
    spawnTimer: DENSITY_MAP[state.config.density],
    nextObstacleId: 1,
    eliminated: [],
    winner: null,
    countdownEnd: now + COUNTDOWN_SECONDS * 1000,
    lastEvent: null,
  };
}

// ============================================================================
// Collision detection
// ============================================================================

function aabbCollision(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ============================================================================
// Obstacle spawning
// ============================================================================

function pickRandomObstacleType(): ObstacleType {
  return OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
}

function spawnObstacle(state: BeerRunState): Obstacle {
  const type = pickRandomObstacleType();
  const def = OBSTACLE_DEFS[type];
  return {
    id: state.nextObstacleId,
    x: WORLD_WIDTH + 50,
    type,
    width: def.width,
    height: def.height,
  };
}

// ============================================================================
// Simulation tick (host-authoritative)
// ============================================================================

export function tickSimulation(
  state: BeerRunState,
  dt: number,
  now: number,
  playerNames: Record<number, string>
): BeerRunState {
  if (state.phase !== 'playing') return state;

  const next: BeerRunState = {
    ...state,
    obstacles: [...state.obstacles],
    playerStates: { ...state.playerStates },
    eliminated: [...state.eliminated],
  };

  // Deep-copy player states
  for (const pn of Object.keys(next.playerStates)) {
    next.playerStates[Number(pn)] = { ...next.playerStates[Number(pn)] };
  }

  // --- Advance game time ---
  next.gameTime += dt;

  // --- Calculate difficulty ramp ---
  const rampMultiplier = Math.min(
    MAX_RAMP_MULTIPLIER,
    1 + RAMP_MAP[next.config.ramp] * (next.gameTime / 10)
  );
  const currentSpeed = SPEED_MAP[next.config.speed] * rampMultiplier;
  next.scrollSpeed = currentSpeed;

  // --- Move obstacles left ---
  for (let i = next.obstacles.length - 1; i >= 0; i--) {
    next.obstacles[i] = { ...next.obstacles[i] };
    next.obstacles[i].x -= currentSpeed * dt;
    if (next.obstacles[i].x + next.obstacles[i].width < -50) {
      next.obstacles.splice(i, 1);
    }
  }

  // --- Spawn obstacles ---
  next.spawnTimer -= dt;
  if (next.spawnTimer <= 0 && next.obstacles.length < MAX_OBSTACLES) {
    const obstacle = spawnObstacle(next);
    next.obstacles.push(obstacle);
    next.nextObstacleId++;

    // After 30s: occasionally spawn pairs (30% chance)
    if (next.gameTime > 30 && Math.random() < 0.3) {
      const second = spawnObstacle(next);
      second.id = next.nextObstacleId;
      second.x = WORLD_WIDTH + 50 + 80 + Math.random() * 60; // small gap after first
      next.obstacles.push(second);
      next.nextObstacleId++;
    }

    // After 60s: occasionally spawn tall obstacles (20% chance)
    if (next.gameTime > 60 && Math.random() < 0.2) {
      const tall: Obstacle = {
        id: next.nextObstacleId,
        x: WORLD_WIDTH + 50 + 200 + Math.random() * 100,
        type: 'stool',
        width: 50,
        height: 65, // extra tall
      };
      next.obstacles.push(tall);
      next.nextObstacleId++;
    }

    // Reset spawn timer with variance
    const baseDensity = DENSITY_MAP[next.config.density];
    const adjustedInterval = Math.max(MIN_SPAWN_INTERVAL, baseDensity / rampMultiplier);
    next.spawnTimer = adjustedInterval * (0.7 + Math.random() * 0.6);
  }

  // --- Player physics ---
  const alivePlayers = Object.keys(next.playerStates)
    .map(Number)
    .filter((pn) => next.playerStates[pn].alive);

  for (const pn of alivePlayers) {
    const ps = next.playerStates[pn];

    // Process jump input
    if (ps.jumpPressed) {
      ps.jumpPressed = false;
      if (ps.y <= 1) {
        // On or near ground — jump!
        ps.vy = JUMP_VELOCITY;
      }
    }

    // Apply gravity
    ps.vy -= GRAVITY * dt;
    ps.vy = Math.max(ps.vy, MAX_FALL_SPEED);

    // Update position
    ps.y += ps.vy * dt;

    // Clamp to ground
    if (ps.y < 0) {
      ps.y = 0;
      ps.vy = 0;
    }
  }

  // --- Collision detection ---
  for (const pn of alivePlayers) {
    const ps = next.playerStates[pn];

    for (const obs of next.obstacles) {
      // Player hitbox: positioned at PLAYER_X, bottom at ps.y
      // Obstacle hitbox: positioned at obs.x, bottom at 0
      const hit = aabbCollision(
        PLAYER_X, ps.y, PLAYER_WIDTH, PLAYER_HEIGHT,
        obs.x, 0, obs.width, obs.height
      );

      if (hit) {
        ps.alive = false;
        ps.eliminatedAt = now;
        ps.deathObstacleType = obs.type;
        next.eliminated.push(pn);
        next.lastEvent = {
          type: 'eliminate',
          player: pn,
          playerName: playerNames[pn] || `Player ${pn}`,
          obstacleType: obs.type,
          timestamp: now,
        };
        break;
      }
    }
  }

  // --- Check end condition ---
  const stillAlive = Object.keys(next.playerStates)
    .map(Number)
    .filter((pn) => next.playerStates[pn].alive);

  if (stillAlive.length <= 1) {
    next.phase = 'finished';
    next.winner = stillAlive[0] ?? null;
  }

  return next;
}
