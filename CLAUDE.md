# TDC Games — Game Maker Instructions

This file teaches you (Claude Code) how to create and modify multiplayer browser games in this project.

## Architecture Overview

- **Server** (`server/`): SpacetimeDB module with generic multiplayer tables (rooms, players, game_state). You should NOT need to modify this for most games.
- **Client** (`client/`): Vite + React app. Each game is a React component in `client/src/games/`.
- **Game state** is a JSON blob synced via SpacetimeDB. Game-specific logic lives entirely in the client component.

## How to Create a New Game

### Step 1: Create the game component

```bash
mkdir client/src/games/your-game
cp client/src/games/_template.tsx client/src/games/your-game/YourGame.tsx
```

### Step 2: Fill in the template sections

The template has clearly marked sections — fill each one:

1. **TYPES** — Define your `YourGameState` interface (the JSON blob synced between players)
2. **INITIAL STATE** — `createInitialState()` returns the starting state
3. **GAME LOGIC** — Pure functions: `checkWinCondition()`, move validation, scoring
4. **COMPONENT** — React rendering + input handlers
5. **CSS** — Create `YourGame.css` in the same folder

### Step 3: Register the game

Add to `client/src/games/registry.ts`:

```typescript
import { YourGame } from './your-game/YourGame';

// Add to the games array:
{
  id: 'your-game',
  name: 'Your Game Name',
  description: 'Short description for the game selector',
  minPlayers: 2,
  maxPlayers: 4,
  component: YourGame,
}
```

## Game Component Props

Every game component receives these props (see `client/src/games/types.ts`):

```typescript
interface GameProps {
  roomId: string;           // Current room ID
  playerName: string;       // This player's display name
  playerNumber: number;     // This player's number (1, 2, 3, ...)
  currentTurn: number;      // Player number whose turn it is
  players: PlayerInfo[];    // All players [{name, playerNumber, score}]
  stateJson?: string;       // Synced game state JSON from SpacetimeDB
  onUpdateState(json): void;  // Push state update (real-time, no turn change)
  onEndTurn(json): void;      // End turn + push state (advances to next player)
  onEndGame(json): void;      // Mark game as finished + push final state
}
```

## Key Patterns

### Turn-based games
```typescript
const isMyTurn = playerNumber === currentTurn;
// Disable inputs when not your turn
<button disabled={!isMyTurn} onClick={handleMove}>Move</button>
// After a move, call onEndTurn to advance
onEndTurn(JSON.stringify(newState));
```

### Real-time games (no turns)
```typescript
// Any player can act anytime — use onUpdateState instead of onEndTurn
onUpdateState(JSON.stringify(newState));
```

### Grid-based layouts
```css
.game-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 0.5rem;
}
```

### Card games
```typescript
interface CardState {
  id: number;
  suit: string;
  value: number;
  faceUp: boolean;
  owner: number | null; // playerNumber
}
```

### Scoring
```typescript
// Scores are tracked in the game state JSON — update via state
const newScores = { ...state.scores, [playerNumber]: state.scores[playerNumber] + points };
```

## Styling Conventions

- Use CSS custom properties from `client/src/index.css` (colors, radius, fonts)
- Create a `.css` file next to the game component
- Keep layouts responsive with `max-width` and media queries
- Use CSS transitions for animations (card flips, moves, etc.)

Available CSS variables:
```
--bg, --bg-surface, --bg-card  (backgrounds)
--text, --text-muted           (text colors)
--primary, --primary-hover     (main accent)
--accent                       (secondary accent / danger)
--success, --warning           (status colors)
--border, --radius             (borders)
--font, --font-mono            (typography)
```

## File Structure

```
client/src/games/
├── types.ts                    # Shared GameProps & GameConfig types
├── registry.ts                 # Game registry — add new games here
├── _template.tsx               # Copy this to start a new game
└── your-game/
    ├── YourGame.tsx            # Game component
    └── YourGame.css            # Game styles
```

## Server Module (for reference)

The SpacetimeDB module (`server/src/index.ts`) provides these tables:
- `rooms` — id, game_type, status, max_players, created_by
- `players` — identity (PK), room_id, display_name, is_host, player_number, score
- `game_states` — room_id, state_json, current_turn, turn_number

And these reducers:
- `create_room` / `join_room` / `leave_room` — room management
- `start_game` — initializes game state
- `update_game_state` — real-time state sync
- `end_turn` — advances turn + updates state
- `update_score` / `end_game` — scoring and finishing

## Regenerating Client Bindings

If you modify `server/src/index.ts` (rarely needed), regenerate the TypeScript client types:

```bash
pnpm generate   # runs: spacetime generate --lang typescript --out-dir client/src/module_bindings --project-path server
```

The generated `module_bindings/` directory is gitignored and must be regenerated after cloning.

## Testing Locally

```bash
pnpm install        # Install dependencies
pnpm generate       # Generate client bindings (first time / after server changes)
pnpm dev            # Start Vite dev server on http://localhost:5173
```

For multiplayer testing with SpacetimeDB running locally:
1. Start SpacetimeDB: `spacetime start`
2. Publish: `cd server && spacetime publish tdc-games`
3. Run client: `pnpm dev`
4. Open two browser tabs

## Deploying

```bash
# Server (SpacetimeDB cloud — free tier)
cd server && spacetime publish tdc-games

# Client (build static files)
cd client && pnpm build
# Deploy dist/ to GitHub Pages, Netlify, or any static host
```
