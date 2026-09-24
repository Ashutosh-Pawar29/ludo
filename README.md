# 🎲 Multiplayer Ludo - Real-Time Game with In-Base Video & Audio Streaming

A modern, full-stack, real-time multiplayer Ludo game featuring interactive 3D dice, full classic rules engine, and **embedded live video & voice streaming directly inside each player's board base** powered by LiveKit SFU.

Designed as a high-performance monorepo with **React 19 + Vite** on the frontend, and **Bun, WebSockets, Express, Redis, PostgreSQL, and LiveKit** on the backend.

---

## 🌟 Key Features

- **⚡ Real-Time Multiplayer Gaming**: Sub-millisecond state updates powered by WebSockets, Redis, and an in-memory game loop.
- **📹 Live Video & Voice in Player Bases**: Players' webcams stream directly inside their corresponding home quadrant on the Ludo board using LiveKit SFU. When a camera is active, player tokens shrink neatly to the bottom edge of the base.
- **🎲 Interactive 3D Dice & Timers**: Realistic 3D dice roll animations with anti-jitter geometry, synchronized 15-second turn timers, and automatic turn forwarding.
- **📱 Responsive Mobile & Desktop UI**:
  - Foldable mobile navigation bar with backdrop blur.
  - Collapsible player drawer with status indicators.
  - Centered board layout optimized for one-handed mobile and tablet play.
- **🏆 Classic Ludo Rules Engine**:
  - Exact token tracks, home corridors, safe star squares, capture-and-send-home mechanics, bonus turns on sixes and captures.
  - Multi-player support (2 to 4 players).
  - First-place and runner-up victory rankings with celebratory confetti.
- **🔐 Authentication & Lobby Management**:
  - Email/password authentication, JWT authorization, and one-click **Instant Guest Login** for frictionless testing.
  - Room creation with customized player capacities and shareable direct room invite links.

---

## 🏗️ System Architecture

This project is optimized for a hybrid cloud deployment:
- **Frontend**: Deployed globally on **Vercel** (`apps/web`).
- **Server Stack**: Deployed on an **AWS EC2 instance** via Docker Compose (`docker-compose.server.yml`).

```
                    [ Players on Mobile & Desktop ]
                                   │
               ┌───────────────────┴───────────────────┐
               ▼                                       ▼
     ┌───────────────────┐                   ┌───────────────────┐
     │   Vercel Edge     │                   │      AWS EC2      │
     │  React 19 (Vite)  │                   │   Server Stack    │
     └─────────┬─────────┘                   └─────────┬─────────┘
               │                                       │
               │ HTTP API Requests                     │ WebRTC Video / Audio
               │ WebSocket Game Loop                   │ (UDP: 7882 / TCP: 7880, 7881)
               ▼                                       ▼
     ┌───────────────────────────────────────────────────────────┐
     │                      EC2 Inbound Gateway                  │
     │       (Nginx Reverse Proxy & Port Forwarding on Port 80)  │
     └─────────────────────────────┬─────────────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Backend API    │      │ WebSocket Server │      │   LiveKit SFU    │
│  (Express: 3000) │      │  (Bun WS: 3001)  │      │  (LiveKit: 7880) │
└────────┬─────────┘      └────────┬─────────┘      └──────────────────┘
         │                         │
         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│   PostgreSQL 16  │      │     Redis 7      │
│   (Database)     │      │  (State Cache)   │
└──────────────────┘      └──────────────────┘
```

---

## 📁 Monorepo Structure

```text
├── apps/
│   ├── web/                     # React 19 + Vite frontend application
│   │   ├── src/components/      # LudoBoard, Dice, MediaControlBar, Lobby, etc.
│   │   ├── src/hooks/           # useLiveKit SFU video/audio hook
│   │   ├── src/config.ts        # Dynamic API, WebSocket & LiveKit URLs
│   │   └── vercel.json          # Vercel SPA routing configuration
│   ├── backend/                 # Express REST API server & LiveKit token service
│   │   └── index.ts             # Auth, rooms, and /api/livekit/token endpoints
│   └── ws/                      # Bun WebSocket game engine
│       ├── index.ts             # WebSocket connection lifecycle & routing
│       └── gameEngine/          # Ludo rules, movement validation & Redis state
├── packages/
│   ├── commons-ts/              # Shared TypeScript types, board constants & Zod schemas
│   └── db/                      # PostgreSQL database schema & Prisma ORM client
├── docker/
│   ├── Dockerfile.backend       # Bun container for REST API
│   ├── Dockerfile.ws            # Bun container for WebSocket server
│   ├── Dockerfile.web           # Alpine Nginx container for full-stack deployment
│   ├── nginx-server.conf        # EC2 server gateway config with CORS & WebSocket proxy
│   └── init-db.sql              # Auto-provisioning SQL script for PostgreSQL
├── docker-compose.server.yml    # Docker Compose for EC2 Server-Only deployment
├── docker-compose.prod.yml      # Docker Compose for All-in-One EC2 deployment
├── deploy.sh                    # One-click EC2 automated deployment script
└── .env.production.example      # Production environment configuration template
```

---

## 🚀 Deployment Guide: Frontend on Vercel

### Step 1: Push Repository to GitHub
Ensure your code is pushed to your GitHub/GitLab repository.

### Step 2: Import into Vercel
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New** $\rightarrow$ **Project**.
2. Select your repository.
3. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click *Edit* and select `apps/web`
   - **Build Command**: `bun run build` (or leave default `vite build`)
   - **Output Directory**: `dist`

### Step 3: Configure Vercel Environment Variables
Under **Environment Variables**, add the following:

| Variable | Description | Example Value |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base URL of your EC2 Backend | `http://<EC2_PUBLIC_IP>` or `https://api.yourdomain.com` |
| `VITE_WS_URL` | WebSocket URL for game engine | `ws://<EC2_PUBLIC_IP>/ws` or `wss://api.yourdomain.com/ws` |
| `VITE_LIVEKIT_URL` | Direct LiveKit SFU URL | `ws://<EC2_PUBLIC_IP>:7880` or `wss://api.yourdomain.com:7880` |

Click **Deploy**! Your frontend will be live on `https://<your-project>.vercel.app`.

---

## 🖥️ Deployment Guide: Backend & Services on AWS EC2

### Step 1: EC2 Instance Requirements
- **Instance Type**: `t3.small` (2GB RAM) or `t3.medium` (4GB RAM) recommended.
- **Operating System**: **Ubuntu 24.04 LTS** or **Ubuntu 22.04 LTS**.
- **Disk**: 20 GB gp3 SSD.

### Step 2: Configure EC2 Security Group (Firewall)
Add the following Inbound Rules in the AWS Management Console:

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | API & WebSocket Gateway |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Secure Gateway (if SSL configured) |
| **Custom TCP** | TCP | `3000` | `0.0.0.0/0` | Backend API (direct access) |
| **Custom TCP** | TCP | `3001` | `0.0.0.0/0` | WebSocket Server (direct access) |
| **Custom TCP** | TCP | `7880` | `0.0.0.0/0` | LiveKit SFU Signaling |
| **Custom TCP** | TCP | `7881` | `0.0.0.0/0` | LiveKit WebRTC TCP Fallback |
| **Custom UDP** | UDP | `7882` | `0.0.0.0/0` | **LiveKit Audio/Video Stream (MUST BE UDP)** |
| **SSH** | TCP | `22` | `My IP` | Secure Shell Access |

### Step 3: Run One-Click Deployment Script
SSH into your EC2 instance and run:

```bash
# 1. Update and install Docker
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt-get install -y docker-compose-plugin
newgrp docker

# 2. Clone repository
git clone <YOUR_GIT_REPOSITORY_URL> ludo
cd ludo

# 3. Launch the Server stack
chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` automatically:
1. Detects your EC2 public IP from AWS metadata.
2. Generates `.env.production` from `.env.production.example`.
3. Runs `docker-compose.server.yml` to spin up PostgreSQL, Redis, LiveKit SFU, Express API, WebSocket Server, and the Nginx Gateway.
4. Auto-provisions database tables via `docker/init-db.sql`.

---

## 🔒 Crucial: Browser Camera & Microphone Permissions (HTTPS)

> [!WARNING]
> Modern web browsers (Chrome, Safari, iOS, Android) **strictly block camera and microphone access on unencrypted `http://` URLs**, unless the hostname is `localhost`.
> When deploying your frontend on Vercel (`https://...`), your backend calls must also use `https://` and `wss://` to avoid browser **Mixed Content** blocks!

### Setting Up Free SSL with Let's Encrypt (Recommended for Production)
1. Point your domain (e.g. `api.yourdomain.com` or a free [DuckDNS](https://www.duckdns.org/) subdomain) to your EC2 public IP.
2. Run Certbot on EC2:
   ```bash
   sudo apt-get install -y certbot
   docker compose -f docker-compose.server.yml stop gateway
   sudo certbot certonly --standalone -d api.yourdomain.com
   docker compose -f docker-compose.server.yml start gateway
   ```
3. Update `VITE_API_URL=https://api.yourdomain.com` and `VITE_WS_URL=wss://api.yourdomain.com/ws` in your Vercel settings.

---

## 💻 Local Development Setup

### Prerequisites
- [Bun](https://bun.sh/) (v1.2+) installed
- [Docker](https://www.docker.com/) installed and running

### 1. Install Dependencies
```bash
bun install
```

### 2. Start Local Databases & LiveKit
```bash
docker compose -f docker-compose.server.yml up postgres redis livekit -d
```

### 3. Run Development Servers
```bash
# Starts web frontend (port 5173), backend (port 3000), and ws (port 3001)
bun run dev
```

Visit `http://localhost:5173` in your browser.

---

## 📡 API & WebSocket Reference

### REST Endpoints (`apps/backend`)
- `POST /api/signup` — Register new player.
- `POST /api/signin` — Authenticate player and receive JWT token.
- `GET  /api/users/me` — Retrieve authenticated user profile.
- `POST /api/create-room` — Create new game room with custom player count.
- `POST /api/join-room` — Join an existing game room.
- `GET  /api/rooms/:roomId` — Get current room details and participants.
- `POST /api/livekit/token` — Generate scoped LiveKit WebRTC access token.

### WebSocket Protocols (`apps/ws`)
- **Client Messages**:
  - `START_GAME` — Host starts the match.
  - `ROLL_DICE` — Active player requests dice roll.
  - `MOVE_TOKEN` — Active player moves selected token.
  - `ADMIN_KICK` — Host kicks an inactive or disconnected player.
  - `PING` / `PONG` — Heartbeat keepalive.
- **Server Messages**:
  - `ROOM_PLAYERS_UPDATE` — Broadcast of connected lobby players.
  - `GAME_STARTED` — Match initialization with board colors.
  - `DICE_ROLLED` — Synced dice value, movable tokens, and bonus turn flags.
  - `GAME_STATE_UPDATE` — Complete board state snapshot.
  - `TURN_TIMEOUT` — Notification when turn timer expires.
  - `GAME_OVER` — Final rankings and winner celebration.

---

## 🛠️ Management & Monitoring Commands

```bash
# View live logs of all server components
docker compose -f docker-compose.server.yml logs -f

# View live logs of WebSocket game server only
docker compose -f docker-compose.server.yml logs -f ws

# Restart backend or WebSocket server
docker compose -f docker-compose.server.yml restart backend
docker compose -f docker-compose.server.yml restart ws

# Stop server stack
docker compose -f docker-compose.server.yml down
```

---

## 📄 License
MIT License. Built with ❤️ for multiplayer gaming enthusiasts.
