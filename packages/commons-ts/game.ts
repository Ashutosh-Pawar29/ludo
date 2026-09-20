export type PlayerColor =
  | "RED"
  | "GREEN"
  | "YELLOW"
  | "BLUE"
  | "PURPLE"
  | "ORANGE";

export type BoardType = "4_PLAYER" | "5_PLAYER" | "6_PLAYER";

export type TokenId = 0 | 1 | 2 | 3;

export type TokenStatus = "BASE" | "ACTIVE" | "HOME";

export interface Token {
  id: TokenId;
  step: number; // 0 = in base/yard, 1..N = on common track, followed by home path, and final home
  position: number; // -1 for base, global coordinate for board cell, or home indicator
  status: TokenStatus;
}

export interface GamePlayer {
  userId: string;
  name: string;
  color: PlayerColor;
  tokens: Token[];
  hasFinished: boolean;
  rank?: number; // 1 for 1st place, 2 for 2nd place, etc.
  missedTurns?: number; // Consecutive timeout count for autoplay
  isDisconnected?: boolean;
}

export type GameStatus = "WAITING" | "STARTING" | "IN_PROGRESS" | "COMPLETED";

export type TurnPhase = "ROLL_DICE" | "MOVE_TOKEN";

export interface LudoGameState {
  roomId: string;
  boardType: BoardType; // "4_PLAYER", "5_PLAYER", or "6_PLAYER"
  maxPlayers: number; // The maximum capacity configured for the room (2..6)
  status: GameStatus;
  players: GamePlayer[]; // Active players in the room
  currentTurnUserId: string;
  turnPhase: TurnPhase;
  currentDice: number | null; // 1 to 6, or null if awaiting roll
  movableTokenIds: TokenId[]; // Token IDs the current player can legally move
  consecutiveSixes: number; // Track for rules that penalize 3 consecutive sixes
  winnerId: string | null;
  rankings: string[]; // List of userIds in order of victory
  lastUpdated: number; // Unix timestamp
}

// -------------------------------------------------------------
// WebSocket Protocol (Discriminated Unions)
// -------------------------------------------------------------

// Messages sent from Client -> WebSocket Server
export type ClientMessage =
  | {
      type: "START_GAME";
    }
  | {
      type: "ROLL_DICE";
    }
  | {
      type: "MOVE_TOKEN";
      tokenId: TokenId;
    }
  | {
      type: "KICK_PLAYER";
      targetUserId: string;
    }
  | {
      type: "PING";
    };

// Messages sent from WebSocket Server -> Client
export type ServerMessage =
  | {
      type: "GAME_STATE";
      state: LudoGameState;
    }
  | {
      type: "DICE_ROLLED";
      userId: string;
      dice: number;
      movableTokenIds: TokenId[];
      autoPassedTurn: boolean; // true if no moves were possible and turn automatically changed
    }
  | {
      type: "TOKEN_MOVED";
      userId: string;
      tokenId: TokenId;
      newPosition: number;
      newStep: number;
      killedToken?: {
        userId: string;
        tokenId: TokenId;
      };
    }
  | {
      type: "TURN_CHANGED";
      currentTurnUserId: string;
      turnPhase: TurnPhase;
    }
  | {
      type: "PLAYER_JOINED";
      player: GamePlayer;
    }
  | {
      type: "ROOM_PLAYERS_UPDATE";
      count: number;
      maxPlayers?: number;
      players: { userId: string; name: string }[];
    }
  | {
      type: "PLAYER_LEFT";
      userId: string;
    }
  | {
      type: "PLAYER_INACTIVE_LIMIT";
      userId: string;
      name: string;
      missedCount: number;
    }
  | {
      type: "PLAYER_KICKED";
      userId: string;
    }
  | {
      type: "GAME_OVER";
      winnerId: string;
      rankings: string[];
    }
  | {
      type: "ERROR";
      message: string;
    };

// -------------------------------------------------------------
// Board Configurations & Track Geometry
// -------------------------------------------------------------

export interface BoardConfig {
  boardType: BoardType;
  totalCommonCells: number;
  homePathCells: number;
  totalStepsToHome: number;
  availableColors: PlayerColor[];
  startPositions: Record<string, number>;
  safePositions: number[];
}

export const FOUR_PLAYER_CONFIG: BoardConfig = {
  boardType: "4_PLAYER",
  totalCommonCells: 52,
  homePathCells: 5,
  totalStepsToHome: 57, // 51 on common track + 5 home path + 1 into home
  availableColors: ["RED", "GREEN", "YELLOW", "BLUE"],
  startPositions: {
    RED: 0,
    GREEN: 13,
    YELLOW: 26,
    BLUE: 39,
  },
  safePositions: [0, 8, 13, 21, 26, 34, 39, 47],
};

export const FIVE_PLAYER_CONFIG: BoardConfig = {
  boardType: "5_PLAYER",
  totalCommonCells: 60, // 12 cells per arm * 5 arms
  homePathCells: 5,
  totalStepsToHome: 65, // 59 on common track + 5 home path + 1 into home
  availableColors: ["RED", "GREEN", "YELLOW", "BLUE", "PURPLE"],
  startPositions: {
    RED: 0,
    GREEN: 12,
    YELLOW: 24,
    BLUE: 36,
    PURPLE: 48,
  },
  safePositions: [0, 8, 12, 20, 24, 32, 36, 44, 48, 56],
};

export const SIX_PLAYER_CONFIG: BoardConfig = {
  boardType: "6_PLAYER",
  totalCommonCells: 72, // 12 cells per arm * 6 arms
  homePathCells: 5,
  totalStepsToHome: 77, // 71 on common track + 5 home path + 1 into home
  availableColors: ["RED", "GREEN", "YELLOW", "BLUE", "PURPLE", "ORANGE"],
  startPositions: {
    RED: 0,
    GREEN: 12,
    YELLOW: 24,
    BLUE: 36,
    PURPLE: 48,
    ORANGE: 60,
  },
  safePositions: [0, 8, 12, 20, 24, 32, 36, 44, 48, 56, 60, 68],
};

export const BOARD_CONFIGS: Record<BoardType, BoardConfig> = {
  "4_PLAYER": FOUR_PLAYER_CONFIG,
  "5_PLAYER": FIVE_PLAYER_CONFIG,
  "6_PLAYER": SIX_PLAYER_CONFIG,
};

/**
 * Returns the appropriate board type based on maxPlayers configured for the room.
 * Rooms with 2 to 4 max players use the 4_PLAYER board.
 * Rooms with 5 max players use the 5_PLAYER board.
 * Rooms with 6 max players use the 6_PLAYER board.
 */
export function getBoardType(maxPlayers: number): BoardType {
  if (maxPlayers <= 4) return "4_PLAYER";
  if (maxPlayers === 5) return "5_PLAYER";
  return "6_PLAYER";
}

/**
 * Returns the BoardConfig for a given board type or player count.
 */
export function getBoardConfig(boardTypeOrMaxPlayers: BoardType | number): BoardConfig {
  const boardType =
    typeof boardTypeOrMaxPlayers === "number"
      ? getBoardType(boardTypeOrMaxPlayers)
      : boardTypeOrMaxPlayers;
  return BOARD_CONFIGS[boardType];
}