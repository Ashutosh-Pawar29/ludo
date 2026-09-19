import {WebSocket, WebSocketServer } from "ws";
import { authenticate } from "./authenticate";
import {type ClientMessage} from "commons-ts/game"
import { getBoardConfig, type GamePlayer, type LudoGameState, type ServerMessage, type TokenId } from "commons-ts/game";
import { db } from "db";
import { initGame } from "./gameEngine/gamemodules";
import { getGameState, saveGameState } from "./gameEngine/redismodules";

const wss = new WebSocketServer({
    port: 3001
})
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


export function getNextTurnUserId(gamestate: LudoGameState, currentUserId: string): string {
    const currentIndex = gamestate.players.findIndex((p) => p.userId === currentUserId);
    let nextIndex = (currentIndex + 1) % gamestate.players.length;
    while (gamestate.players[nextIndex]?.hasFinished) {
        nextIndex = (nextIndex + 1) % gamestate.players.length;
    }
    return gamestate.players[nextIndex]?.userId as string;
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
                    const dice_num = Math.floor(Math.random() * 6) + 1
                    if(dice_num == 6){
                        gamestate.consecutiveSixes +=1
                        if(gamestate.consecutiveSixes == 3){
                            gamestate.consecutiveSixes = 0;
                            gamestate.currentTurnUserId = getNextTurnUserId(gamestate, userId);
                            await saveGameState(gamestate);
                            broadcastToRoom(roomId,{type:"DICE_ROLLED",userId,dice:dice_num,movableTokenIds:[],autoPassedTurn:true})
                            return
                        }
                    }
                    else{
                        gamestate.consecutiveSixes = 0
                    }
                    const config = getBoardConfig(gamestate.boardType);
                    const currentPlayer = gamestate.players.find((player) => player.userId === userId);

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
                        await saveGameState(gamestate);
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
                const token = player?.tokens.find((t) => t.id === tokenId);
                if (!player || !token) {
                    ws.send(JSON.stringify({ type: "ERROR", message: "Token not found" }));
                    return;
                }

                const dice = gamestate.currentDice!;
                const config = getBoardConfig(gamestate.boardType);
                let killedToken: { userId: string; tokenId: TokenId } | undefined = undefined;
                let bonusTurn = dice === 6;

                // Move token
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
                        bonusTurn = true; // Bonus turn for moving a token into HOME!
                    } else {
                        const commonTrackSteps = config.totalCommonCells - 1;
                        if (token.step <= commonTrackSteps) {
                            token.position = (startPos + (token.step - 1)) % config.totalCommonCells;

                            // Check for captures on non-safe squares
                            const isSafe = config.safePositions.includes(token.position);
                            if (!isSafe) {
                                for (const opponent of gamestate.players) {
                                    if (opponent.userId === userId) continue;
                                    for (const oppToken of opponent.tokens) {
                                        if (oppToken.status === "ACTIVE" && oppToken.position === token.position) {
                                            oppToken.status = "BASE";
                                            oppToken.step = 0;
                                            oppToken.position = -1;
                                            killedToken = { userId: opponent.userId, tokenId: oppToken.id };
                                            bonusTurn = true; // Bonus turn for capturing an opponent token!
                                            break;
                                        }
                                    }
                                    if (killedToken) break;
                                }
                            }
                        } else {
                            // On home path
                            token.position = 100 + (token.step - commonTrackSteps);
                        }
                    }
                }

                // Check if this player has finished
                const allHome = player.tokens.every((t) => t.status === "HOME");
                if (allHome && !player.hasFinished) {
                    player.hasFinished = true;
                    player.rank = gamestate.rankings.length + 1;
                    gamestate.rankings.push(userId);
                    if (!gamestate.winnerId) {
                        gamestate.winnerId = userId;
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
                    userId,
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
                        gamestate.currentTurnUserId = getNextTurnUserId(gamestate, userId);
                    }

                    await saveGameState(gamestate);
                    broadcastToRoom(roomId, {
                        type: "TURN_CHANGED",
                        currentTurnUserId: gamestate.currentTurnUserId,
                        turnPhase: gamestate.turnPhase,
                    });
                }
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

    ws.on("close",()=>{
        const room = socketconnections.get(roomId);
        if (room) {
            room.delete(userId);
            if (room.size === 0) {
                socketconnections.delete(roomId);
            }
        }
    })
})