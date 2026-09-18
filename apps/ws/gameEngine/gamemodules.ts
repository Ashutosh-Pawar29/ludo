import { getBoardConfig, getBoardType, type GamePlayer, type LudoGameState, type PlayerColor, type TokenId } from "commons-ts/game";
import { saveGameState } from "./redismodules";

export async function initGame(roomId:string,playerslist:{name:string,userId:string}[],maxPlayers:number):Promise<LudoGameState>{
    const boardType = getBoardType(maxPlayers)
    const config = getBoardConfig(boardType)
    const players:GamePlayer[] = playerslist.map((player,index)=>{
        return {
            userId:player.userId,
            name:player.name,
            color:config.availableColors[index] as PlayerColor,
            tokens:Array.from({length:4},(_,i)=>{
                return {
                    id:i as TokenId,
                    step:0,
                    position:-1,
                    status:"BASE",
                }
            }),
            hasFinished:false
        }
    })
    const gamestate: LudoGameState = {
        roomId:roomId,
        boardType,
        maxPlayers,
        status:"IN_PROGRESS",
        players,
        currentTurnUserId:players[0]?.userId as string,
        currentDice:null,
        turnPhase:"ROLL_DICE",
        movableTokenIds:[],
        lastUpdated:Date.now(),
        consecutiveSixes:0,
        rankings:[],
        winnerId:null
    }
    await saveGameState(gamestate)
    return gamestate
}