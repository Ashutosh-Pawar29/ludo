-- PostgreSQL Initialization Script for Multiplayer Ludo
-- Automatically executed on first container boot

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User table
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    rank INT NOT NULL DEFAULT 0
);

-- Rooms table
CREATE TABLE IF NOT EXISTS "rooms" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "adminId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "maxPlayers" INT NOT NULL DEFAULT 4,
    status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "rooms_adminId_idx" ON "rooms"("adminId");

-- Refresh Tokens table
CREATE TABLE IF NOT EXISTS "refreshToken" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    valid BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS "refreshToken_userId_idx" ON "refreshToken"("userId");

-- Game table
CREATE TABLE IF NOT EXISTS "game" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type TEXT NOT NULL CHECK (type IN ('classic', 'quick')),
    "roomId" TEXT NOT NULL REFERENCES "rooms"(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    winnerid TEXT,
    runnerid TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "startTime" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "endTime" TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "game_roomId_idx" ON "game"("roomId");

-- Game History table
CREATE TABLE IF NOT EXISTS "gamehistory" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "gameId" TEXT NOT NULL REFERENCES "game"(id) ON DELETE CASCADE,
    "winnerId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "runnerId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "gamehistory_gameId_idx" ON "gamehistory"("gameId");
CREATE INDEX IF NOT EXISTS "gamehistory_winnerId_idx" ON "gamehistory"("winnerId");
CREATE INDEX IF NOT EXISTS "gamehistory_runnerId_idx" ON "gamehistory"("runnerId");

-- Game Player table
CREATE TABLE IF NOT EXISTS "gameplayer" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "roomId" TEXT NOT NULL REFERENCES "rooms"(id) ON DELETE CASCADE,
    "playerId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    "joinTime" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "leftTime" TIMESTAMPTZ,
    rank INT
);
CREATE INDEX IF NOT EXISTS "gameplayer_playerId_idx" ON "gameplayer"("playerId");
CREATE INDEX IF NOT EXISTS "gameplayer_roomId_idx" ON "gameplayer"("roomId");
