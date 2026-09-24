# 🚀 AWS EC2 Deployment Guide - Multiplayer Ludo

This guide walks you through deploying the complete multiplayer Ludo stack (React Frontend, WebSocket Game Server, Express REST API, PostgreSQL, Redis, and LiveKit SFU) on an AWS EC2 instance.

---

## 1. Prerequisites & Recommended Instance

- **AWS EC2 Instance Type**: `t3.medium` (2 vCPU, 4GB RAM) recommended, or `t3.small` (2GB RAM) minimum.
- **Operating System**: **Ubuntu 24.04 LTS** or **Ubuntu 22.04 LTS**.
- **Storage**: At least 20 GB gp3 SSD.

---

## 2. Step 1: Configure AWS Security Group (Firewall)

Your EC2 instance requires specific inbound ports to allow web traffic, WebSocket connections, and LiveKit WebRTC audio/video streams.

In the **AWS Management Console** $\rightarrow$ **EC2** $\rightarrow$ **Security Groups** $\rightarrow$ Select your instance's security group $\rightarrow$ **Edit inbound rules**:

| Type | Protocol | Port Range | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | `22` | `My IP` (or `0.0.0.0/0`) | Remote SSH access |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | Web App & REST API |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Secure Web (if SSL is enabled) |
| **Custom TCP** | TCP | `7880` | `0.0.0.0/0` | LiveKit SFU Signaling |
| **Custom TCP** | TCP | `7881` | `0.0.0.0/0` | LiveKit WebRTC TCP Fallback |
| **Custom UDP** | UDP | `7882` | `0.0.0.0/0` | LiveKit WebRTC Audio/Video Stream |

> [!IMPORTANT]
> **Port `7882` MUST be UDP**! WebRTC media packets (video and audio streams) travel over UDP. If UDP 7882 is blocked, video/audio tracks cannot stream between players.

---

## 3. Step 2: Connect to your EC2 Instance

Connect to your EC2 instance via SSH:
```bash
ssh -i /path/to/your-key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

---

## 4. Step 3: Install Docker and Git

Run the following commands on your EC2 instance to install Docker and Docker Compose:

```bash
# Update package list and install prerequisites
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y git curl

# Install Docker engine
curl -fsSL https://get.docker.com | sh

# Allow running docker without sudo
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Apply group changes (or log out and log back in)
newgrp docker
```

Verify installation:
```bash
docker --version
docker compose version
```

---

## 5. Step 4: Clone Repository & Deploy

1. Clone your project repository onto the EC2 machine:
```bash
git clone <YOUR_REPOSITORY_GIT_URL> ludo
cd ludo
```

2. Make `deploy.sh` executable and run it:
```bash
chmod +x deploy.sh
./deploy.sh
```

### What `deploy.sh` does automatically:
1. Detects your EC2 instance's public IP from AWS metadata service.
2. Copies `.env.production.example` to `.env.production` and configures `EC2_PUBLIC_IP`.
3. Builds the production Docker images:
   - `ludo_web`: Vite build served by Alpine Nginx with reverse proxy for `/api` and `/ws`.
   - `ludo_backend`: Express API with Prisma client.
   - `ludo_ws`: Bun WebSocket game engine connected to Redis.
4. Boots up `ludo_postgres`, `ludo_redis`, `ludo_livekit`, `ludo_backend`, `ludo_ws`, and `ludo_web`.
5. Executes the initial PostgreSQL schema script (`docker/init-db.sql`).

---

## 6. Step 5: Test the Deployment

Once deployed, open your web browser and visit:
```text
http://<YOUR_EC2_PUBLIC_IP>
```

You can now:
1. Sign up or sign in as a user.
2. Create or join a Ludo room.
3. Share the room link with friends or test on your mobile device!

---

## 7. Crucial Note: Camera/Mic Access (HTTPS Requirement)

> [!WARNING]
> Modern web browsers (Chrome, Safari, iOS, Android) **block camera and microphone access on unencrypted HTTP URLs** (e.g. `http://13.232.x.x`), unless the hostname is `localhost`.

### For Direct IP Testing (Without Domain):
To test audio/video directly with an IP address in Chrome:
1. In Chrome, navigate to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. Enter your EC2 address: `http://<YOUR_EC2_PUBLIC_IP>`
3. Set the dropdown to **Enabled** and restart Chrome.

### For Production (Free Domain & SSL via Let's Encrypt):
For frictionless mobile and friend play, attach a free domain and SSL certificate:

1. Point a domain or subdomain (e.g., `ludo.yourdomain.com` or a free DuckDNS domain `myludo.duckdns.org`) to your EC2 Public IP (A Record).
2. Install Certbot on EC2:
   ```bash
   sudo apt-get install -y certbot
   ```
3. Request a certificate:
   ```bash
   # Temporarily stop web container so certbot can bind port 80
   docker compose -f docker-compose.prod.yml stop web
   sudo certbot certonly --standalone -d ludo.yourdomain.com
   docker compose -f docker-compose.prod.yml start web
   ```
4. Mount the certificates into `docker/nginx.conf` and expose port `443` in `docker-compose.prod.yml`.

---

## 8. Useful Maintenance & Debugging Commands

### View Live Logs
```bash
# View logs from all services in real time
docker compose -f docker-compose.prod.yml logs -f

# View logs from a specific service
docker compose -f docker-compose.prod.yml logs -f ws
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f livekit
```

### Check Container Status
```bash
docker compose -f docker-compose.prod.yml ps
```

### Restart a Service
```bash
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart ws
```

### Stop / Start the Entire Stack
```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Start all services
docker compose -f docker-compose.prod.yml up -d
```

### Update Deployment After Code Changes
When you pull new changes from git:
```bash
git pull origin main
./deploy.sh
```

---

## 9. Architecture Summary

```
                       [ Player Phones & Browsers ]
                                     |
               +---------------------+---------------------+
               | (Port 80/443 HTTP)                        | (UDP 7882 / TCP 7880, 7881)
               v                                           v
       +---------------+                           +---------------+
       |     Nginx     |                           |  LiveKit SFU  |
       +---------------+                           +---------------+
         |           |
  (Static Assets)    |
  /dist/index.html   |
                     v
      +-----------------------------+
      | /api/*  -> backend:3000     |
      | /ws     -> ws:3001          |
      +-----------------------------+
               |             |
               v             v
       +---------------+  +---------------+
       |  PostgreSQL   |  |     Redis     |
       |     :5432     |  |     :6379     |
       +---------------+  +---------------+
```
