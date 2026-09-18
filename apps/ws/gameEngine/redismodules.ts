import type { LudoGameState } from "commons-ts/game";
import { createClient } from "redis";

const client = createClient();

await client.connect().then(()=>{console.log("connected to redis ")}).catch((err)=>{console.log(err),process.exit(1)});

export async function saveGameState(state:LudoGameState):Promise<void>{
    const key = `game:${state.roomId}`
    state.lastUpdated = Date.now()
    await client.set(key,JSON.stringify(state),{EX:60*60*2})
}
export async function getGameState(roomId:string):Promise<LudoGameState | null>{
    const key = `game:${roomId}`
    try{
        let gamestate = await client.get(key)
        if(gamestate){
            return JSON.parse(gamestate)
        }
        return null
    }
    catch(err){
        console.log(err)
        return null
    }
}

export async function deleteGame(roomId:string) {
    const key = `game:${roomId}`
    return await client.del(key)
}