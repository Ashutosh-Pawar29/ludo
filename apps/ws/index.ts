import {WebSocket, WebSocketServer } from "ws";
import { authenticate } from "./authenticate";
import {type ClientMessage} from "commons-ts/game"
import { getBoardConfig, type GamePlayer, type LudoGameState, type ServerMessage, type TokenId } from "commons-ts/game";
import { db } from "db";
import { initGame } from "./gameEngine/gamemodules";
import { getGameState, saveGameState } from "./gameEngine/redismodules";

const PORT = Number(process.env.PORT) || 3001;
const wss = new WebSocketServer({
    port: PORT
});
console.log(`WebSocket server listening on port ${PORT}`);
const database = db.orm.public
let socketconnections = new Map<string,Map<string,WebSocket>>()

export function broadcastToRoom(roomId: string, message: ServerMessage) {
    const room = socketconnections.get(roomId);
    if (!room) return;
    const payload = JSON.stringify(message);
    for (const [userId, clientWs] of room) {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(payload);
        }
    }
}

export async function broadcastLobbyUpdate(roomId: string) {
    const room = socketconnections.get(roomId);
    if (!room) return;
    const roomRecord = await database.rooms.where({ id: roomId }).first();
    const players: { userId: string; name: string }[] = [];
    for (const pid of room.keys()) {
        const u = await database.User.where({ id: pid }).first();
        if (u) {
            players.push({ userId: u.id, name: u.name });
        }
    }
    const msg: ServerMessage = {
        type: "ROOM_PLAYERS_UPDATE",
        count: room.size,
        maxPlayers: roomRecord?.maxPlayers ?? 2,
        players,
    };
    broadcastToRoom(roomId, msg);
}


export function getNextTurnUserId(gamestate: LudoGameState, currentUserId: string): string {
    const currentIndex = gamestate.players.findIndex((p) => p.userId === currentUserId);
    let nextIndex = (currentIndex + 1) % gamestate.players.length;
    while (gamestate.players[nextIndex]?.hasFinished) {
        nextIndex = (nextIndex + 1) % gamestate.players.length;
    }
    return gamestate.players[nextIndex]?.userId as string;
}

export const roomTurnTimers = new Map<string, NodeJS.Timeout>();
export const TURN_TIMEOUT_MS = 15000; // 15 seconds per turn

export function clearTurnTimer(roomId: string) {
    const existing = roomTurnTimers.get(roomId);
    if (existing) {
        clearTimeout(existing);
        roomTurnTimers.delete(roomId);
    }
}

export function startTurnTimer(roomId: string, timeoutMs: number = TURN_TIMEOUT_MS) {
    clearTurnTimer(roomId);
    const timer = setTimeout(() => {
        handleTurnTimeout(roomId).catch((err) => {
            console.error(`Error in handleTurnTimeout for room ${roomId}:`, err);
        });
    }, timeoutMs);
    roomTurnTimers.set(roomId, timer);
}

export async function executeMoveToken(
    roomId: string,
    gamestate: LudoGameState,
    player: GamePlayer,
    tokenId: TokenId,
    dice: number,
    config: ReturnType<typeof getBoardConfig>
) {
    const token = player.tokens.find((t) => t.id === tokenId);
    if (!token) return;

    let killedToken: { userId: string; tokenId: TokenId } | undefined = undefined;
    let bonusTurn = dice === 6;

    const startPos = config.startPositions[player.color] ?? 0;
    if (token.status === "BASE") {
        token.status = "ACTIVE";
        token.step = 1;
        token.position = startPos;
    } else if (token.status === "ACTIVE") {
        token.step += dice;
        if (token.step === config.totalStepsToHome) {
            token.status = "HOME";
            token.position = -1;
            bonusTurn = true;
        } else {
            const commonTrackSteps = config.totalCommonCells - 1;
            if (token.step <= commonTrackSteps) {
                token.position = (startPos + (token.step - 1)) % config.totalCommonCells;

                // Check for captures on non-safe positions
                const isSafe = config.safePositions.includes(token.position);
                if (!isSafe) {
                    for (const opponent of gamestate.players) {
                        if (opponent.userId === player.userId) continue;
                        for (const oppToken of opponent.tokens) {
                            if (oppToken.status === "ACTIVE" && oppToken.position === token.position) {
                                oppToken.status = "BASE";
                                oppToken.step = 0;
                                oppToken.position = -1;
                                killedToken = { userId: opponent.userId, tokenId: oppToken.id };
                                bonusTurn = true;
                                break;
                            }
                        }
                        if (killedToken) break;
                    }
                }
            } else {
                token.position = 100 + (token.step - commonTrackSteps);
            }
        }
    }

    // Check if this player has finished
    const allHome = player.tokens.every((t) => t.status === "HOME");
    if (allHome && !player.hasFinished) {
        player.hasFinished = true;
        player.rank = gamestate.rankings.length + 1;
        gamestate.rankings.push(player.userId);
        if (!gamestate.winnerId) {
            gamestate.winnerId = player.userId;
        }
    }

    // Check Game Over (if 1 or fewer players remain unfinished)
    const unfinishedPlayers = gamestate.players.filter((p) => !p.hasFinished);
    if (unfinishedPlayers.length <= 1) {
        const lastPlayer = unfinishedPlayers[0];
        if (lastPlayer) {
            lastPlayer.hasFinished = true;
            lastPlayer.rank = gamestate.rankings.length + 1;
            gamestate.rankings.push(lastPlayer.userId);
        }
        gamestate.status = "COMPLETED";
    }

    // Broadcast TOKEN_MOVED to all clients
    broadcastToRoom(roomId, {
        type: "TOKEN_MOVED",
        userId: player.userId,
        tokenId: token.id,
        newPosition: token.position,
        newStep: token.step,
        killedToken,
    });

    // Update Turn & State
    gamestate.currentDice = null;
    gamestate.movableTokenIds = [];
    gamestate.lastUpdated = Date.now();

    if (gamestate.status === "COMPLETED") {
        clearTurnTimer(roomId);
        await saveGameState(gamestate);
        await database.rooms.where({ id: roomId }).update({ status: "completed" });
        broadcastToRoom(roomId, {
            type: "GAME_OVER",
            winnerId: gamestate.winnerId!,
            rankings: gamestate.rankings,
        });
    } else {
        if (bonusTurn && !player.hasFinished) {
            gamestate.turnPhase = "ROLL_DICE";
        } else {
            gamestate.consecutiveSixes = 0;
            gamestate.turnPhase = "ROLL_DICE";
            gamestate.currentTurnUserId = getNextTurnUserId(gamestate, player.userId);
        }

        await saveGameState(gamestate);
        broadcastToRoom(roomId, {
            type: "TURN_CHANGED",
            currentTurnUserId: gamestate.currentTurnUserId,
            turnPhase: gamestate.turnPhase,
        });
        startTurnTimer(roomId);
    }
}

export async function handleTurnTimeout(roomId: string) {
    const room = socketconnections.get(roomId);
    if (!room) {
        clearTurnTimer(roomId);
        return;
    }

    const gamestate = await getGameState(roomId);
    if (!gamestate || gamestate.status !== "IN_PROGRESS") {
        clearTurnTimer(roomId);
        return;
    }

    const currentUserId = gamestate.currentTurnUserId;
    const player = gamestate.players.find((p) => p.userId === currentUserId);
    if (!player || player.hasFinished) {
        gamestate.currentTurnUserId = getNextTurnUserId(gamestate, currentUserId);
        gamestate.turnPhase = "ROLL_DICE";
        gamestate.currentDice = null;
        gamestate.movableTokenIds = [];
        gamestate.consecutiveSixes = 0;
        await saveGameState(gamestate);
        broadcastToRoom(roomId, {
            type: "TURN_CHANGED",
            currentTurnUserId: gamestate.currentTurnUserId,
            turnPhase: gamestate.turnPhase,
        });
        startTurnTimer(roomId);
        return;
    }

    // Increment consecutive missed turns
    player.missedTurns = (player.missedTurns ?? 0) + 1;

    // Notify room admin if player hit 5 missed turns
    if (player.missedTurns >= 5) {
        const roomRecord = await database.rooms.where({ id: roomId }).first();
        if (roomRecord?.adminId) {
            const adminWs = room.get(roomRecord.adminId);
            if (adminWs && adminWs.readyState === WebSocket.OPEN) {
                adminWs.send(JSON.stringify({
                    type: "PLAYER_INACTIVE_LIMIT",
                    userId: currentUserId,
                    name: player.name,
                    missedCount: player.missedTurns,
                }));
            }
        }
    }

    const config = getBoardConfig(gamestate.boardType);

    if (gamestate.turnPhase === "ROLL_DICE") {
        const dice_num = Math.floor(Math.random() * 6) + 1;
        if (dice_num === 6) {
            gamestate.consecutiveSixes += 1;
            if (gamestate.consecutiveSixes === 3) {
                gamestate.consecutiveSixes = 0;
                gamestate.currentTurnUserId = getNextTurnUserId(gamestate, currentUserId);
                gamestate.turnPhase = "ROLL_DICE";
                gamestate.currentDice = null;
                gamestate.movableTokenIds = [];
                await saveGameState(gamestate);
                broadcastToRoom(roomId, {
                    type: "DICE_ROLLED",
                    userId: currentUserId,
                    dice: dice_num,
                    movableTokenIds: [],
                    autoPassedTurn: true,
                });
                broadcastToRoom(roomId, {
                    type: "TURN_CHANGED",
                    currentTurnUserId: gamestate.currentTurnUserId,
                    turnPhase: gamestate.turnPhase,
                });
                startTurnTimer(roomId);
                return;
            }
        } else {
            gamestate.consecutiveSixes = 0;
        }

        gamestate.movableTokenIds = (player.tokens ?? [])
            .filter((token) => {
                if (token.status === "HOME") return false;
                if (token.status === "BASE") return dice_num === 6;
                return token.step + dice_num <= config.totalStepsToHome;
            })
            .map((token) => token.id);

        gamestate.currentDice = dice_num;
        gamestate.lastUpdated = Date.now();

        if (gamestate.movableTokenIds.length === 0) {
            gamestate.consecutiveSixes = 0;
            gamestate.currentTurnUserId = getNextTurnUserId(gamestate, currentUserId);
            gamestate.turnPhase = "ROLL_DICE";
            gamestate.currentDice = null;
            await saveGameState(gamestate);
            broadcastToRoom(roomId, {
                type: "DICE_ROLLED",
                userId: currentUserId,
                dice: dice_num,
                movableTokenIds: [],
                autoPassedTurn: true,
            });
            broadcastToRoom(roomId, {
                type: "TURN_CHANGED",
                currentTurnUserId: gamestate.currentTurnUserId,
                turnPhase: gamestate.turnPhase,
            });
            startTurnTimer(roomId);
            return;
        }

        gamestate.turnPhase = "MOVE_TOKEN";
        await saveGameState(gamestate);
        broadcastToRoom(roomId, {
            type: "DICE_ROLLED",
            userId: currentUserId,
            dice: dice_num,
            movableTokenIds: gamestate.movableTokenIds,
            autoPassedTurn: false,
        });

        // Automatically move the first available token
        const chosenTokenId = gamestate.movableTokenIds[0] as TokenId;
        await executeMoveToken(roomId, gamestate, player, chosenTokenId, dice_num, config);
    } else if (gamestate.turnPhase === "MOVE_TOKEN") {
        if (gamestate.movableTokenIds.length > 0 && gamestate.currentDice !== null) {
            const chosenTokenId = gamestate.movableTokenIds[0] as TokenId;
            await executeMoveToken(roomId, gamestate, player, chosenTokenId, gamestate.currentDice, config);
        } else {
            gamestate.consecutiveSixes = 0;
            gamestate.currentTurnUserId = getNextTurnUserId(gamestate, currentUserId);
            gamestate.turnPhase = "ROLL_DICE";
            gamestate.currentDice = null;
            gamestate.movableTokenIds = [];
            await saveGameState(gamestate);
            broadcastToRoom(roomId, {
                type: "TURN_CHANGED",
                currentTurnUserId: gamestate.currentTurnUserId,
                turnPhase: gamestate.turnPhase,
            });
            startTurnTimer(roomId);
        }
    }
}

wss.on("connection",(ws, req)=>{
    console.log("user connected")
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token')
    const roomId = url.searchParams.get('roomId')
    if(!token||!roomId){
        ws.send("token or roomId not found")
        ws.close()
        return
    }
    const userId = authenticate(token,process.env.JWT_SECRET as string) as string
    if(!userId){
        ws.send("invalid token")
        ws.close()
        return
    }
    if(!socketconnections.has(roomId)){
        socketconnections.set(roomId,new Map())
    }
    socketconnections.get(roomId)!.set(userId,ws)

    // Broadcast current connected lobby players to everyone in the room
    broadcastLobbyUpdate(roomId).catch(console.error);

    // Sync state if reconnecting to an ongoing game
    getGameState(roomId).then(async (existingGame) => {
        if (existingGame && existingGame.status === "IN_PROGRESS") {
            const player = existingGame.players.find((p) => p.userId === userId);
            if (player) {
                player.isDisconnected = false;
                await saveGameState(existingGame);
            }
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "GAME_STATE", state: existingGame }));
            }
        }
    }).catch(console.error);

    ws.on("message",async (msg:ClientMessage)=>{
        try{
            const message = JSON.parse(msg.toString())
            if(message.type=="PING"){
                ws.send("PONG")
            }
            else if(message.type == "START_GAME"){
                const room = socketconnections.get(roomId)
                if(!room) return
                const roomRecord =await database.rooms.where({id:roomId}).first()
                if(!roomRecord){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Room does not exist" }));
                    return;
                }

                if (roomRecord.adminId !== userId) {
                    ws.send(JSON.stringify({ type: "ERROR", message: "Only the room host can start the game" }));
                    return;
                }

                if(room.size<2){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Need at least 2 players to start" }))
                    return
                }
                const players: { userId: string; name: string }[] = []
                for(let player of room.keys()){
                    const user = await database.User.where({"id":player}).first()
                    if(!user) return
                    const userId = user.id
                    const name = user.name
                    players.push({userId,name})
                }
                const initialstate =await initGame(roomId,players,roomRecord.maxPlayers)
                await database.rooms.where({ id: roomId }).update({ status: "in_progress" });
                broadcastToRoom(roomId,{type:"GAME_STATE",state:initialstate})
                startTurnTimer(roomId);
            }


            else if(message.type == "ROLL_DICE"){
                const room = socketconnections.get(roomId)
                if(!room) return
                let gamestate:LudoGameState | null = await getGameState(roomId)
                if(!gamestate) return
                else if (gamestate.currentTurnUserId != userId){
                    ws.send(JSON.stringify({type:"ERROR","message":"not your turn"}))
                    return
                }
                else if(gamestate.turnPhase != "ROLL_DICE"){
                    ws.send(JSON.stringify({type:"ERROR","message":"Dice already rolled"}))
                    return
                }
                else{
                    const currentPlayer = gamestate.players.find((player) => player.userId === userId);
                    if (currentPlayer) {
                        currentPlayer.missedTurns = 0; // Reset consecutive missed turns on manual play
                    }

                    const dice_num = Math.floor(Math.random() * 6) + 1
                    if(dice_num == 6){
                        gamestate.consecutiveSixes +=1
                        if(gamestate.consecutiveSixes == 3){
                            gamestate.consecutiveSixes = 0;
                            gamestate.currentTurnUserId = getNextTurnUserId(gamestate, userId);
                            await saveGameState(gamestate);
                            broadcastToRoom(roomId,{type:"DICE_ROLLED",userId,dice:dice_num,movableTokenIds:[],autoPassedTurn:true})
                            broadcastToRoom(roomId, {
                                type: "TURN_CHANGED",
                                currentTurnUserId: gamestate.currentTurnUserId,
                                turnPhase: gamestate.turnPhase,
                            });
                            startTurnTimer(roomId);
                            return
                        }
                    }
                    else{
                        gamestate.consecutiveSixes = 0
                    }
                    const config = getBoardConfig(gamestate.boardType);

                    gamestate.movableTokenIds = (currentPlayer?.tokens ?? [])
                        .filter((token) => {
                            if (token.status === "HOME") return false;
                            if (token.status === "BASE") return dice_num === 6;
                            return token.step + dice_num <= config.totalStepsToHome;
                        })
                        .map((token) => token.id);

                    gamestate.currentDice = dice_num;
                    gamestate.lastUpdated = Date.now();

                    if (gamestate.movableTokenIds.length === 0) {
                        gamestate.consecutiveSixes = 0;
                        gamestate.currentTurnUserId = getNextTurnUserId(gamestate, userId);
                        broadcastToRoom(roomId, {
                            type: "DICE_ROLLED",
                            userId,
                            dice: gamestate.currentDice,
                            movableTokenIds: [],
                            autoPassedTurn: true,
                        });
                        broadcastToRoom(roomId, {
                            type: "TURN_CHANGED",
                            currentTurnUserId: gamestate.currentTurnUserId,
                            turnPhase: gamestate.turnPhase,
                        });
                        await saveGameState(gamestate);
                        startTurnTimer(roomId);
                        return;
                    }

                    gamestate.turnPhase = "MOVE_TOKEN";
                    await saveGameState(gamestate);
                    broadcastToRoom(roomId, {
                        type: "DICE_ROLLED",
                        userId,
                        dice: gamestate.currentDice,
                        movableTokenIds: gamestate.movableTokenIds,
                        autoPassedTurn: false,
                    });
                    startTurnTimer(roomId);

                    // If only one token is eligible to move, auto-move it after a brief pause
                    if (gamestate.movableTokenIds.length === 1) {
                        const autoTokenId = gamestate.movableTokenIds[0] as TokenId;
                        setTimeout(async () => {
                            try {
                                const latestState = await getGameState(roomId);
                                if (
                                    latestState &&
                                    latestState.turnPhase === "MOVE_TOKEN" &&
                                    latestState.currentTurnUserId === userId &&
                                    latestState.movableTokenIds.includes(autoTokenId)
                                ) {
                                    const p = latestState.players.find((pl) => pl.userId === userId);
                                    if (p) {
                                        const cfg = getBoardConfig(latestState.boardType);
                                        await executeMoveToken(roomId, latestState, p, autoTokenId, latestState.currentDice!, cfg);
                                    }
                                }
                            } catch (err) {
                                console.error(`Error auto-moving single token in room ${roomId}:`, err);
                            }
                        }, 1200);
                    }
                }
                
            }
            else if(message.type == "MOVE_TOKEN"){
                const room = socketconnections.get(roomId);
                if(!room) return;
                let gamestate: LudoGameState | null = await getGameState(roomId);
                if(!gamestate) return;

                if (gamestate.currentTurnUserId !== userId){
                    ws.send(JSON.stringify({ type: "ERROR", message: "not your turn" }));
                    return;
                }
                if (gamestate.turnPhase !== "MOVE_TOKEN"){
                    ws.send(JSON.stringify({ type: "ERROR", message: "not turn to move token" }));
                    return;
                }

                const tokenId: TokenId = message.tokenId ?? message.TokenId;
                if (!gamestate.movableTokenIds.includes(tokenId)){
                    ws.send(JSON.stringify({ type: "ERROR", message: "invalid token moved" }));
                    return;
                }

                const player = gamestate.players.find((p) => p.userId === userId);
                if (!player) {
                    ws.send(JSON.stringify({ type: "ERROR", message: "Player not found" }));
                    return;
                }

                player.missedTurns = 0; // Reset consecutive missed turns on manual play
                const dice = gamestate.currentDice!;
                const config = getBoardConfig(gamestate.boardType);

                await executeMoveToken(roomId, gamestate, player, tokenId, dice, config);
            }
            else if(message.type == "KICK_PLAYER"){
                const room = socketconnections.get(roomId);
                if(!room) return;
                const roomRecord = await database.rooms.where({ id: roomId }).first();
                if(!roomRecord){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Room not found" }));
                    return;
                }
                if(roomRecord.adminId !== userId){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Only the room host can kick players" }));
                    return;
                }

                const gamestate = await getGameState(roomId);
                if(!gamestate || gamestate.status !== "IN_PROGRESS"){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Game is not in progress" }));
                    return;
                }

                const targetUserId = message.targetUserId;
                if(targetUserId === userId){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Cannot kick yourself" }));
                    return;
                }

                const targetPlayer = gamestate.players.find((p) => p.userId === targetUserId);
                if(!targetPlayer || targetPlayer.hasFinished){
                    ws.send(JSON.stringify({ type: "ERROR", message: "Player not found or already finished" }));
                    return;
                }

                // Mark player as finished and reset active tokens to base
                targetPlayer.hasFinished = true;
                for(const t of targetPlayer.tokens){
                    if(t.status === "ACTIVE"){
                        t.status = "BASE";
                        t.step = 0;
                        t.position = -1;
                    }
                }

                // Close socket of kicked player if present
                const targetWs = room.get(targetUserId);
                if(targetWs){
                    targetWs.send(JSON.stringify({ type: "ERROR", message: "You were removed from the game by the host" }));
                    targetWs.close();
                    room.delete(targetUserId);
                }

                broadcastToRoom(roomId, { type: "PLAYER_KICKED", userId: targetUserId });

                // Check if remaining active players is <= 1
                const remainingActive = gamestate.players.filter((p) => !p.hasFinished);
                if(remainingActive.length <= 1){
                    const lastPlayer = remainingActive[0];
                    if(lastPlayer){
                        lastPlayer.hasFinished = true;
                        lastPlayer.rank = gamestate.rankings.length + 1;
                        gamestate.rankings.push(lastPlayer.userId);
                        if(!gamestate.winnerId){
                            gamestate.winnerId = lastPlayer.userId;
                        }
                    }
                    gamestate.status = "COMPLETED";
                    clearTurnTimer(roomId);
                    await saveGameState(gamestate);
                    await database.rooms.where({ id: roomId }).update({ status: "completed" });
                    broadcastToRoom(roomId, {
                        type: "GAME_OVER",
                        winnerId: gamestate.winnerId!,
                        rankings: gamestate.rankings,
                    });
                    return;
                }

                // If it was the kicked player's turn, advance turn
                if(gamestate.currentTurnUserId === targetUserId){
                    gamestate.currentTurnUserId = getNextTurnUserId(gamestate, targetUserId);
                    gamestate.turnPhase = "ROLL_DICE";
                    gamestate.currentDice = null;
                    gamestate.movableTokenIds = [];
                    gamestate.consecutiveSixes = 0;
                    broadcastToRoom(roomId, {
                        type: "TURN_CHANGED",
                        currentTurnUserId: gamestate.currentTurnUserId,
                        turnPhase: gamestate.turnPhase,
                    });
                    startTurnTimer(roomId);
                }

                gamestate.lastUpdated = Date.now();
                await saveGameState(gamestate);
                broadcastToRoom(roomId, { type: "GAME_STATE", state: gamestate });
            }
            else{
                ws.send("invalid request")
            }
            console.log(message)
        }
        catch(err){
            ws.send(JSON.stringify({ type: "ERROR", message: "Invalid JSON format" }))
        }
    })

    ws.on("close", async () => {
        const room = socketconnections.get(roomId);
        if (room) {
            room.delete(userId);
            if (room.size === 0) {
                socketconnections.delete(roomId);
                clearTurnTimer(roomId);
            } else {
                broadcastLobbyUpdate(roomId).catch(console.error);
            }
        }
        const gamestate = await getGameState(roomId);
        if (gamestate && gamestate.status === "IN_PROGRESS") {
            const player = gamestate.players.find((p) => p.userId === userId);
            if (player) {
                player.isDisconnected = true;
                await saveGameState(gamestate);
            }
            broadcastToRoom(roomId, { type: "PLAYER_LEFT", userId });
        }
    })
})