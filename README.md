# TDC Games

A multiplayer browser game maker powered by [SpacetimeDB](https://spacetimedb.com/). Create simple DOM-based games (card games, board games, quizzes) and play them with friends in real-time.

## How It Works

- **SpacetimeDB** handles rooms, players, and state sync — no backend code needed
- Each game is a **React component** with game logic in the client
- **Claude Code reads `CLAUDE.md`** to know how to create new games from a template

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [SpacetimeDB CLI](https://spacetimedb.com/docs/) (for multiplayer)

### Install & Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 to play.

### Create a New Game

Just tell Claude Code:

> "Create a trivia quiz game with multiple choice questions"

Claude reads `CLAUDE.md` for instructions, copies the template, and builds the game.

## Deploying

### Server (SpacetimeDB Cloud — free)

```bash
spacetime login
cd server && spacetime publish tdc-games
```

### Client (GitHub Pages — free)

```bash
cd client && pnpm build
# Push dist/ to GitHub Pages
```

Set environment variables for production:
```
VITE_SPACETIMEDB_URI=wss://maincloud.spacetimedb.com
VITE_SPACETIMEDB_MODULE=tdc-games
```

## Project Structure

```
tdc-games/
├── CLAUDE.md              # Game maker instructions for Claude Code
├── server/src/index.ts    # SpacetimeDB module (rooms, players, state)
├── client/src/
│   ├── components/        # Shared UI (GameSelector, Lobby, GameShell)
│   └── games/
│       ├── _template.tsx  # Copy to create a new game
│       ├── registry.ts    # Game registry
│       └── memory/        # Example: Memory Match game
└── README.md
```

## Games

| Game | Description | Players |
|------|-------------|---------|
| Memory Match | Flip cards to find matching pairs | 2–4 |
