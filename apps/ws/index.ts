import {WebSocket, WebSocketServer } from "ws";
import { authenticate } from "./authenticate";
import {type ClientMessage} from "commons-ts/game"
import type { ServerMessage } from "commons-ts/game";
import { db } from "db";
import { initGame } from "./gameEngine/gamemodules";

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
    const userId = authenticate(token,process.env.JWT_SECRET as string)
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
                broadcastToRoom(roomId,message)
            }
            else if(message.type == "MOVE_TOKEN"){
                broadcastToRoom(roomId,message)
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