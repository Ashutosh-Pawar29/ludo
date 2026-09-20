import { getBoardConfig, getBoardType, type GamePlayer, type LudoGameState, type PlayerColor, type TokenId } from "commons-ts/game";
import { saveGameState } from "./redismodules";

/**
 * Assigns colors to players so that:
 * - 2 players are placed diagonally opposite (RED: Top-Left, YELLOW: Bottom-Right)
 * - 3 players have RED and YELLOW diagonal, with GREEN managed between them at Top-Right
 * - 4, 5, 6 players fill all corresponding corners and side docks
 */
export function getAssignedColors(count: number, maxPlayers: number): PlayerColor[] {
    if (count === 2) {
        return ["RED", "YELLOW"]; // Diagonally opposite corners (Top-Left & Bottom-Right)
    }
    if (count === 3) {
        return ["RED", "GREEN", "YELLOW"]; // Diagonal (Red & Yellow) with Green between them
    }
    if (maxPlayers === 5 || count === 5) {
        return ["RED", "GREEN", "YELLOW", "BLUE", "PURPLE"];
    }
    if (maxPlayers === 6 || count === 6) {
        return ["RED", "GREEN", "YELLOW", "BLUE", "PURPLE", "ORANGE"];
    }
    return ["RED", "GREEN", "YELLOW", "BLUE"];
}

export async function initGame(
    roomId: string,
    playerslist: { name: string; userId: string }[],
    maxPlayers: number
): Promise<LudoGameState> {
    const boardType = getBoardType(maxPlayers);
    const assignedColors = getAssignedColors(playerslist.length, maxPlayers);

    const players: GamePlayer[] = playerslist.map((player, index) => {
        return {
            userId: player.userId,
            name: player.name,
            color: assignedColors[index] as PlayerColor,
            tokens: Array.from({ length: 4 }, (_, i) => {
                return {
                    id: i as TokenId,
                    step: 0,
                    position: -1,
                    status: "BASE",
                };
            }),
            hasFinished: false,
        };
    });

    const gamestate: LudoGameState = {
        roomId: roomId,
        boardType,
        maxPlayers,
        status: "IN_PROGRESS",
        players,
        currentTurnUserId: players[0]?.userId as string,
        currentDice: null,
        turnPhase: "ROLL_DICE",
        movableTokenIds: [],
        lastUpdated: Date.now(),
        consecutiveSixes: 0,
        rankings: [],
        winnerId: null,
    };

    await saveGameState(gamestate);
    return gamestate;
}