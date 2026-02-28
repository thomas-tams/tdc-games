import { schema, table, t } from 'spacetimedb/server';

// ============================================================================
// TABLES — Generic multiplayer primitives (no game-specific logic)
// ============================================================================

const rooms = table(
  {
    public: true,
  },
  {
    id: t.u32().primaryKey().autoInc(),
    game_type: t.string(),
    status: t.string(), // 'waiting' | 'playing' | 'finished'
    max_players: t.u32(),
    created_by: t.identity(),
  }
);

const players = table(
  {
    public: true,
    indexes: [
      { accessor: 'byRoomId', algorithm: 'btree' as const, columns: ['room_id'] as const },
    ],
  },
  {
    identity: t.identity().primaryKey(),
    room_id: t.u32(),
    display_name: t.string(),
    is_host: t.bool(),
    player_number: t.u32(),
    score: t.u32(),
  }
);

const game_states = table(
  { public: true },
  {
    room_id: t.u32().primaryKey(),
    state_json: t.string(),
    current_turn: t.u32(),
    turn_number: t.u32(),
  }
);

// ============================================================================
// SCHEMA
// ============================================================================

const spacetimedb = schema({ rooms, players, game_states });
export default spacetimedb;

// ============================================================================
// REDUCERS — all exported as named exports
// ============================================================================

export const create_room = spacetimedb.reducer(
  {
    game_type: t.string(),
    max_players: t.u32(),
    display_name: t.string(),
  },
  (ctx, { game_type, max_players, display_name }) => {
    // Remove player from any existing room
    const existing = ctx.db.players.identity.find(ctx.sender);
    if (existing) {
      ctx.db.players.identity.delete(ctx.sender);
    }

    const room = ctx.db.rooms.insert({
      id: 0,
      game_type,
      status: 'waiting',
      max_players,
      created_by: ctx.sender,
    });

    ctx.db.players.insert({
      identity: ctx.sender,
      room_id: room.id,
      display_name,
      is_host: true,
      player_number: 1,
      score: 0,
    });
  }
);

export const join_room = spacetimedb.reducer(
  {
    room_id: t.u32(),
    display_name: t.string(),
  },
  (ctx, { room_id, display_name }) => {
    const room = ctx.db.rooms.id.find(room_id);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Game already started');

    // Remove player from any existing room
    const existing = ctx.db.players.identity.find(ctx.sender);
    if (existing) {
      ctx.db.players.identity.delete(ctx.sender);
    }

    // Count current players in room
    let playerCount = 0;
    for (const _ of ctx.db.players.byRoomId.filter(room_id)) {
      playerCount++;
    }

    if (playerCount >= room.max_players) {
      throw new Error('Room is full');
    }

    ctx.db.players.insert({
      identity: ctx.sender,
      room_id,
      display_name,
      is_host: false,
      player_number: playerCount + 1,
      score: 0,
    });
  }
);

export const leave_room = spacetimedb.reducer((ctx) => {
  const player = ctx.db.players.identity.find(ctx.sender);
  if (!player) return;

  const roomId = player.room_id;
  ctx.db.players.identity.delete(ctx.sender);

  // Check if room is now empty
  let remainingPlayers = 0;
  let firstRemaining: typeof player | null = null;
  for (const p of ctx.db.players.byRoomId.filter(roomId)) {
    remainingPlayers++;
    if (!firstRemaining) firstRemaining = p;
  }

  if (remainingPlayers === 0) {
    // Delete room and game state
    ctx.db.rooms.id.delete(roomId);
    ctx.db.game_states.room_id.delete(roomId);
  } else if (player.is_host && firstRemaining) {
    // Transfer host to next player
    firstRemaining.is_host = true;
    ctx.db.players.identity.update(firstRemaining);
  }
});

export const start_game = spacetimedb.reducer(
  { initial_state_json: t.string() },
  (ctx, { initial_state_json }) => {
    const player = ctx.db.players.identity.find(ctx.sender);
    if (!player) throw new Error('Not in a room');
    if (!player.is_host) throw new Error('Only host can start the game');

    const room = ctx.db.rooms.id.find(player.room_id);
    if (!room) throw new Error('Room not found');
    if (room.status !== 'waiting') throw new Error('Game already started');

    room.status = 'playing';
    ctx.db.rooms.id.update(room);

    ctx.db.game_states.insert({
      room_id: player.room_id,
      state_json: initial_state_json,
      current_turn: 1,
      turn_number: 1,
    });
  }
);

export const update_game_state = spacetimedb.reducer(
  { new_state_json: t.string() },
  (ctx, { new_state_json }) => {
    const player = ctx.db.players.identity.find(ctx.sender);
    if (!player) throw new Error('Not in a room');

    const state = ctx.db.game_states.room_id.find(player.room_id);
    if (!state) throw new Error('Game not started');

    state.state_json = new_state_json;
    ctx.db.game_states.room_id.update(state);
  }
);

export const end_turn = spacetimedb.reducer(
  { new_state_json: t.string() },
  (ctx, { new_state_json }) => {
    const player = ctx.db.players.identity.find(ctx.sender);
    if (!player) throw new Error('Not in a room');

    const state = ctx.db.game_states.room_id.find(player.room_id);
    if (!state) throw new Error('Game not started');

    if (state.current_turn !== player.player_number) {
      throw new Error('Not your turn');
    }

    // Count players to wrap around
    let maxPlayerNumber = 0;
    for (const p of ctx.db.players.byRoomId.filter(player.room_id)) {
      if (p.player_number > maxPlayerNumber) {
        maxPlayerNumber = p.player_number;
      }
    }

    state.state_json = new_state_json;
    state.current_turn =
      state.current_turn >= maxPlayerNumber ? 1 : state.current_turn + 1;
    state.turn_number += 1;
    ctx.db.game_states.room_id.update(state);
  }
);

export const update_score = spacetimedb.reducer(
  { player_identity: t.identity(), new_score: t.u32() },
  (ctx, { player_identity, new_score }) => {
    const caller = ctx.db.players.identity.find(ctx.sender);
    if (!caller) throw new Error('Not in a room');

    const target = ctx.db.players.identity.find(player_identity);
    if (!target) throw new Error('Target player not found');
    if (target.room_id !== caller.room_id) throw new Error('Not in same room');

    target.score = new_score;
    ctx.db.players.identity.update(target);
  }
);

export const end_game = spacetimedb.reducer(
  { final_state_json: t.string() },
  (ctx, { final_state_json }) => {
    const player = ctx.db.players.identity.find(ctx.sender);
    if (!player) throw new Error('Not in a room');

    const room = ctx.db.rooms.id.find(player.room_id);
    if (!room) throw new Error('Room not found');

    room.status = 'finished';
    ctx.db.rooms.id.update(room);

    const state = ctx.db.game_states.room_id.find(player.room_id);
    if (state) {
      state.state_json = final_state_json;
      ctx.db.game_states.room_id.update(state);
    }
  }
);
