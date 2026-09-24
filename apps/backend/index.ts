import express from "express";
import cors from "cors";
import { db } from "db";
import { a, createroom, joinroom, signin } from "commons-ts/ztypes";
import type { createRoom, joinRoom, signinBody, signupBody } from "commons-ts/types";
import jwt  from "jsonwebtoken";
import bcrypt from "bcrypt";
import { authenticate, refreshtokenAuthenticate } from "./middlewares";
import { AccessToken } from "livekit-server-sdk";

const database = db.orm.public
const jwt_pass:string = process.env.JWT_SECRET as string
const jwt_pass_refreshtoken:string = process.env.REFRESHTOKEN_JWT_SECRET as string
let refreshtokens = new Map<string,string>()
const app = express();

app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "token", "Authorization"]
}));
app.use(express.json())

app.get("/", async (req, res) => {
    res.send("hello")
})

app.post('/api/signup', async (req, res) => {
    try {
        let body: signupBody = req.body;
        let valid = a.safeParse(body);
        if (!valid.success) {
            return res.status(400).json({ error: "invalid_data", message: "Invalid data sent. Username and password must be at least 6 characters." });
        }
        const emailExist = await database.User.where({ email: body.email }).first();
        if (emailExist) {
            return res.status(409).json({ error: "email_exists", message: "Email already registered. Please sign in." });
        }
        let hashpass = await bcrypt.hash(body.password, 10);
        let user = await database.User.create({ email: body.email, name: body.username, password: hashpass, rank: 0 });
        
        if (user) {
            let id = user.id;
            const token = jwt.sign({ id }, jwt_pass, { expiresIn: "7d" });
            const refreshToken = jwt.sign({ id }, jwt_pass_refreshtoken, { expiresIn: "30d" });
            let refreshTokenRes = await database.refreshToken.create({ userId: id, token: refreshToken, valid: true });
            if (refreshTokenRes) {
                return res.json({ message: "signup successful", token, refreshToken, user: { id, name: body.username, email: body.email } });
            }
            return res.status(500).json({ error: "signup_failed", message: "Error initializing session token. Please retry." });
        }
        return res.status(500).json({ error: "signup_failed", message: "Failed to create user account." });
    } catch (err: any) {
        console.error("Signup error:", err);
        return res.status(500).json({ error: "server_error", message: err?.message || "Internal server error" });
    }
});

app.post("/api/signin", async (req, res) => {
    try {
        const body: signinBody = req.body;
        const valid = signin.safeParse(body);
        if (!valid.success) {
            return res.status(400).json({ error: "invalid_data", message: "Please provide a valid email and password" });
        }
        const user = await database.User.first({ email: body.email });
        if (!user) {
            return res.status(401).json({ error: "invalid_credentials", message: "No account found with this email" });
        }
        const validPass = await bcrypt.compare(body.password, user.password);
        if (!validPass) {
            return res.status(401).json({ error: "invalid_credentials", message: "Incorrect password" });
        }
        let id = user.id;
        const token = jwt.sign({ id }, jwt_pass, { expiresIn: "7d" });
        const refreshToken = jwt.sign({ id }, jwt_pass_refreshtoken, { expiresIn: "30d" });
        let refreshTokenRes = await database.refreshToken.create({ userId: id, token: refreshToken, valid: true });
        if (refreshTokenRes) {
            return res.json({ message: "signin successful", token, refreshToken, user: { id, name: user.name, email: user.email } });
        }
        return res.status(500).json({ error: "signin_failed", message: "Error initializing session token." });
    } catch (err: any) {
        console.error("Signin error:", err);
        return res.status(500).json({ error: "server_error", message: err?.message || "Internal server error" });
    }
});

app.post("/api/refreshtoken", refreshtokenAuthenticate, async (req, res) => {
    try {
        const id: string = req.body.id;
        const reftoken = req.headers.token as string;
        const refreshToken = await database.refreshToken.where({ userId: id, token: reftoken }).first();
        if (!refreshToken || !refreshToken.valid) {
            return res.status(401).json({ error: "invalid_token", message: "Invalid or revoked refresh token" });
        }
        const token: string = jwt.sign({ id }, jwt_pass, { expiresIn: "7d" });
        return res.json({ token });
    } catch (err: any) {
        return res.status(500).json({ error: "server_error", message: "Failed to refresh token" });
    }
});

app.get("/api/logout", async (req, res) => {
    try {
        const token = req.headers.token as string;
        if (token) {
            await database.refreshToken.where({ token }).update({ valid: false });
        }
        return res.json({ message: "logout success" });
    } catch {
        return res.json({ message: "logout success" });
    }
});

app.get("/api/users/me", authenticate, async (req, res) => {
    try {
        const id = req.body.id;
        const user = await database.User.where({ id }).select("id", "rank", "email", "name").first();
        if (!user) {
            return res.status(404).json({ error: "user_not_found", message: "User account does not exist" });
        }
        return res.json(user);
    } catch (err: any) {
        return res.status(500).json({ error: "server_error", message: "Failed to fetch user profile" });
    }
});

app.get("/api/users/:id", async (req, res) => {
    try {
        const id = req.params.id;
        const user = await database.User.select("id", "email", "name", "rank").first({ id });
        if (!user) {
            return res.status(404).json({ error: "user_not_found", message: "User does not exist" });
        }
        return res.json(user);
    } catch (err: any) {
        return res.status(500).json({ error: "server_error", message: "Failed to fetch user" });
    }
});

app.post("/api/create-room", authenticate, async (req, res) => {
    try {
        const body: createRoom = req.body;
        const validation = createroom.safeParse(body);
        if (!validation.success) {
            return res.status(400).json({ error: "invalid_data", message: "Invalid room settings", details: validation.error.format() });
        }
        let user = await database.User.first({ id: body.id });
        if (!user) {
            return res.status(401).json({ error: "user_not_found", message: "User account not found. Please log in again." });
        }
        let room = await database.rooms.create({ adminId: body.id, maxPlayers: body.maxPlayers, status: "created" });
        let joined = await database.gameplayer.create({ playerId: body.id, roomId: room.id, status: "joined" });
        if (joined) {
            return res.json({ message: "room created", room });
        }
        return res.status(500).json({ error: "join_failed", message: "Failed to initialize game player for room", room });
    } catch (err: any) {
        console.error("Create room error:", err);
        return res.status(500).json({ error: "create_room_failed", message: err?.message || "Failed to create room in database" });
    }
});

app.post("/api/join-room", authenticate, async (req, res) => {
    try {
        const body: joinRoom = req.body;
        const valid = joinroom.safeParse(body);
        if (!valid.success) {
            return res.status(400).json({ error: "invalid_data", message: "Invalid join room parameters" });
        }
        const room = await database.rooms.first({ id: valid.data.roomid as string });
        if (!room) {
            return res.status(404).json({ error: "room_not_found", message: "Room does not exist" });
        }
        let playerId = body.userid as string;
        let roomId = body.roomid as string;
        let totalJoinedPlayers = await database.gameplayer.where({ roomId }).all();
        if (room.maxPlayers <= totalJoinedPlayers.length) {
            return res.status(400).json({ error: "room_full", message: "Sorry, this room is full" });
        }
        let player = await database.gameplayer.create({ playerId, roomId, status: "joined" });
        return res.json({ message: "player joined", player });
    } catch (err: any) {
        console.error("Join room error:", err);
        return res.status(500).json({ error: "join_failed", message: err?.message || "Failed to join room" });
    }
});


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

app.post("/api/livekit/token", authenticate, async (req, res) => {
    try {
        const userId = req.body.id as string;
        const roomId = (req.body.roomId || req.query.roomId) as string;

        if (!roomId) {
            return res.status(400).json({ error: "roomId is required" });
        }

        const user = await database.User.first({ id: userId });
        const userName = user?.name || "Player";

        const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
        const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
        const serverUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";

        const at = new AccessToken(apiKey, apiSecret, {
            identity: userId,
            name: userName,
        });

        at.addGrant({
            roomJoin: true,
            room: roomId,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });

        const token = await at.toJwt();
        return res.json({ token, serverUrl, userId, userName });
    } catch (err) {
        console.error("Error generating LiveKit token:", err);
        return res.status(500).json({ error: "Failed to generate LiveKit token" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`server listening on port ${PORT}`);
});