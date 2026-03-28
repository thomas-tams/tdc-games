// Shared types for all games

export interface PlayerInfo {
  name: string;
  playerNumber: number;
  score: number;
}

export interface GameProps {
  roomId: string;
  playerName: string;
  playerNumber: number;
  currentTurn: number;
  players: PlayerInfo[];
  stateJson?: string; // Synced game state from SpacetimeDB
  isSpectator: boolean;
  onUpdateState: (stateJson: string) => void;
  onEndTurn: (stateJson: string) => void;
  onEndGame: (stateJson: string) => void;
}

export interface GameConfig {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  component: React.ComponentType<GameProps>;
  spectatorComponent?: React.ComponentType<GameProps>;
}
