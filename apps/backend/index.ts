import express from "express";
import cors from "cors";
import { db } from "db";
import { a, createroom, joinroom, signin } from "commons-ts/ztypes";
import type { createRoom, joinRoom, signinBody, signupBody } from "commons-ts/types";
import jwt  from "jsonwebtoken";
import bcrypt from "bcrypt";
import { authenticate, refreshtokenAuthenticate } from "./middlewares";

const database = db.orm.public
const jwt_pass:string = process.env.JWT_SECRET as string
const jwt_pass_refreshtoken:string = process.env.REFRESHTOKEN_JWT_SECRET as string
let refreshtokens = new Map<string,string>()
const app = express();

app.use(cors());
app.use(express.json())

app.get("/", async (req, res) => {
    res.send("hello")
})

app.post('/api/signup',async (req,res)=>{
    let body:signupBody = req.body;
    let valid = a.safeParse(body) 
    if(!valid.success){
        return res.send("invalid data sent. Please send valid data ")
    }
    const emailExist = await database.User.where({email:body.email}).first()
    
    if(emailExist){
        return res.send("email already exist")
    }
    let hashpass = await bcrypt.hash(body.password,10)
    let user = await database.User.create({email:body.email,name:body.username,password:hashpass,rank:0})
    
    if(user){
        let id = user.id
        const token = jwt.sign({id},jwt_pass,{expiresIn:3600})
        const refreshToken = jwt.sign({id},jwt_pass_refreshtoken)
        let refreshTokenRes = await database.refreshToken.create({userId:id,token:refreshToken,valid:true})
        if(refreshTokenRes){
            return res.json({message:"signup successful ",token,refreshToken,user:{id,name:body.username,email:body.email}})
        }
        res.send('sorry retry')
    }
})


app.post("/api/signin",async (req,res)=>{
    const body:signinBody = req.body
    const valid = signin.safeParse(body)
    
    if(!valid.success){
        return res.send("invalid data sent. Please send valid data ")
    }
    const user = await database.User.first({email:body.email})
    if(!user){
        return res.send("invalid email sent")
    }
    const validPass = await bcrypt.compare(body.password,user.password)
    if(!validPass){
        return res.send("incorrect password")
    }
    let id = user.id
    const token = jwt.sign({id},jwt_pass,{expiresIn:3600})
    const refreshToken = jwt.sign({id},jwt_pass_refreshtoken)
    let refreshTokenRes = await database.refreshToken.create({userId:id,token:refreshToken,valid:true})
    if(refreshTokenRes){
        return res.json({message:"signin successful ",token,refreshToken,user:{id,name:user.name,email:user.email}})
    }
    res.send('sorry retry')
})

app.post("/api/refreshtoken",refreshtokenAuthenticate,async (req,res)=>{
    const id:string = req.body.id
    const reftoken = req.headers.token as string
    const refreshToken =await database.refreshToken.where({userId:id,token:reftoken}).first()
    if(!refreshToken || !refreshToken.valid){
        return res.send("invalid token")
    }
    const token:string = jwt.sign({id},jwt_pass,{expiresIn:3600})
    res.json({token})
})

app.get("/api/logout",async (req,res)=>{
    const token = req.headers.token as string
    const refreshtoken =await database.refreshToken.where({token}).update({valid:false})
    if(refreshtoken){
        return res.send("logout success")
    }
    res.send("invalid token sent")
})

app.get("/api/users/me",authenticate,async (req,res)=>{
    const id = req.body.id
    const user = await database.User.where({id}).select("id","rank","email","name").first()
    if(!user){
        return res.send("no such user exist ")
    }
    res.json(user)
})

app.get("/api/users/:id",async(req,res)=>{
    const id = req.params.id
    const user =await database.User.select("id","email","name","rank").first({id})
    if(!user){
        return res.send("no such user exist ")
    }
    res.json(user)
})

app.post("/api/create-room",authenticate,async (req,res)=>{
    const body:createRoom = req.body
    const validation = createroom.safeParse(body)
    if(!validation.success){
        return res.send("invalid data sent")
    }
    let user =await database.User.first({id:body.id})
    if(!user){
        return res.send("invalid user")
    }
    let room =await database.rooms.create({adminId:body.id,maxPlayers:body.maxPlayers,status:"created"})
    let joined = await database.gameplayer.create({playerId:body.id,roomId:room.id,status:"joined"})
    if(joined){
        return res.json({"message":"room created ",room})
    }
    res.json({"message":"failed to join room",room})
})

app.post("/api/join-room",authenticate,async (req,res)=>{
    const body:joinRoom = req.body
    const valid = joinroom.safeParse(body)
    if(!valid.success){
        return res.json({"message":"invalild data sent"})
    }
    const room = await database.rooms.first({id: valid.data.roomid as string})
    if(room){
        let playerId = body.userid as string
        let roomId = body.roomid as string
        let totalJoinedPlayers = await database.gameplayer.where({roomId}).all()
        if(room.maxPlayers<=totalJoinedPlayers.length){
            return res.send("sorry room is full")
        }
        let player =await database.gameplayer.create({playerId,roomId,status:"joined"})
        return res.json({msg:"player joined",player})
    }
    res.send("room does not exist")
})


app.get("/api/gamehistory/:gameid",authenticate,async (req,res)=>{
    const gameid = req.params.gameid as string
    let gamehistory =await database.gamehistory.first({gameId:gameid})
    res.json(gamehistory)
})

app.get("/api/rooms/:id", async (req, res) => {
    const roomId = req.params.id as string;
    const room = await database.rooms.first({ id: roomId });
    if (!room) {
        return res.status(404).json({ error: "Room not found" });
    }
    const players = await database.gameplayer.where({ roomId }).all();
    res.json({ room, players });
});

app.listen(process.env.PORT,()=>{
    console.log(`server listening on port ${process.env.PORT}`)
})