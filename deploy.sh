#!/usr/bin/env bash
# ==============================================================================
# Multiplayer Ludo - Turnkey EC2 Deployment Script
# Usage:
#   ./deploy.sh          (Deploy Server-Only stack for Vercel frontend)
#   ./deploy.sh all      (Deploy Full stack including Nginx-hosted frontend)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

MODE="${1:-server}"
if [ "$MODE" = "all" ] || [ "$MODE" = "full" ] || [ "$MODE" = "prod" ]; then
    COMPOSE_FILE="docker-compose.prod.yml"
    DEPLOY_DESC="Full-Stack (Backend + WebSocket + LiveKit + DBs + Nginx Frontend)"
else
    COMPOSE_FILE="docker-compose.server.yml"
    DEPLOY_DESC="Server-Only (Backend API + WebSocket + LiveKit SFU + DBs + Gateway for Vercel)"
fi

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}    🚀 Multiplayer Ludo - EC2 Deployment Script       ${NC}"
echo -e "${BLUE}======================================================${NC}"
echo -e "Deployment Target: ${GREEN}${DEPLOY_DESC}${NC}"
echo -e "Compose File:      ${YELLOW}${COMPOSE_FILE}${NC}\n"

# 1. Check Docker & Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[ERROR] Docker is not installed.${NC}"
    echo "To install Docker on Ubuntu/Debian, run:"
    echo "  curl -fsSL https://get.docker.com | sh"
    echo "  sudo usermod -aG docker \$USER"
    echo "Then log out and log back in."
    exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}[ERROR] Docker Compose plugin is not installed.${NC}"
    echo "Run: sudo apt-get update && sudo apt-get install -y docker-compose-plugin"
    exit 1
fi

# Detect docker compose command
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# 2. Automatically detect EC2 Public IP
echo -e "${YELLOW}[1/4] Detecting Public IP...${NC}"
PUBLIC_IP=""

# Try AWS IMDSv2 metadata
TOKEN=$(curl -s -m 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
    PUBLIC_IP=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
fi

# Fallback: check public ipify service
if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP=$(curl -s -m 3 https://api.ipify.org 2>/dev/null || true)
fi

if [ -n "$PUBLIC_IP" ]; then
    echo -e "${GREEN}✓ Detected Public IP: ${PUBLIC_IP}${NC}"
else
    echo -e "${YELLOW}Could not automatically detect public IP. Using 127.0.0.1 (you can edit .env.production).${NC}"
    PUBLIC_IP="127.0.0.1"
fi

# 3. Setup environment configuration
echo -e "\n${YELLOW}[2/4] Configuring environment (.env.production)...${NC}"
if [ ! -f ".env.production" ]; then
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env.production
        # Replace EC2_PUBLIC_IP with detected IP
        if [ "$PUBLIC_IP" != "127.0.0.1" ]; then
            sed -i "s/EC2_PUBLIC_IP=127.0.0.1/EC2_PUBLIC_IP=${PUBLIC_IP}/g" .env.production
        fi
        echo -e "${GREEN}✓ Created .env.production with EC2_PUBLIC_IP=${PUBLIC_IP}${NC}"
    else
        echo -e "${RED}[ERROR] .env.production.example not found!${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env.production already exists.${NC}"
    if grep -q "EC2_PUBLIC_IP=127.0.0.1" .env.production && [ "$PUBLIC_IP" != "127.0.0.1" ]; then
        sed -i "s/EC2_PUBLIC_IP=127.0.0.1/EC2_PUBLIC_IP=${PUBLIC_IP}/g" .env.production
        echo -e "${GREEN}✓ Updated EC2_PUBLIC_IP to ${PUBLIC_IP} in .env.production${NC}"
    fi
fi

# Ensure .env also mirrors .env.production
cp .env.production .env

# 4. Build and Start Containers
echo -e "\n${YELLOW}[3/4] Building and launching containers...${NC}"
$DOCKER_COMPOSE --env-file .env.production -f "$COMPOSE_FILE" down --remove-orphans || true
$DOCKER_COMPOSE --env-file .env.production -f "$COMPOSE_FILE" build
$DOCKER_COMPOSE --env-file .env.production -f "$COMPOSE_FILE" up -d

# 5. Check Status
echo -e "\n${YELLOW}[4/4] Verifying services...${NC}"
sleep 4
$DOCKER_COMPOSE --env-file .env.production -f "$COMPOSE_FILE" ps

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}    🎉 Deployment Complete!                           ${NC}"
echo -e "${GREEN}======================================================${NC}"
if [ "$COMPOSE_FILE" = "docker-compose.server.yml" ]; then
    echo -e "Server Gateway:    ${BLUE}http://${PUBLIC_IP}${NC}"
    echo -e "Backend API:       ${BLUE}http://${PUBLIC_IP}:3000${NC} (or http://${PUBLIC_IP}/api)"
    echo -e "WebSocket Game:    ${BLUE}ws://${PUBLIC_IP}:3001${NC}   (or ws://${PUBLIC_IP}/ws)"
    echo -e "LiveKit Signaling: ${BLUE}ws://${PUBLIC_IP}:7880${NC}"
    echo -e "LiveKit WebRTC:    ${BLUE}UDP Port 7882 / TCP Port 7881${NC}"
    echo -e "\n${YELLOW}📱 Vercel Frontend Setup:${NC}"
    echo -e "Set these Environment Variables in your Vercel Project:"
    echo -e "  VITE_API_URL     = http://${PUBLIC_IP}"
    echo -e "  VITE_WS_URL      = ws://${PUBLIC_IP}/ws"
    echo -e "  VITE_LIVEKIT_URL = ws://${PUBLIC_IP}:7880"
else
    echo -e "Web App URL:       ${BLUE}http://${PUBLIC_IP}${NC}"
    echo -e "LiveKit Signaling: ${BLUE}ws://${PUBLIC_IP}:7880${NC}"
    echo -e "LiveKit WebRTC:    ${BLUE}UDP Port 7882 / TCP Port 7881${NC}"
fi

echo -e "\n${YELLOW}⚠️  AWS EC2 Security Group Inbound Rules:${NC}"
echo -e "  - TCP  80       (Gateway HTTP)"
echo -e "  - TCP  3000     (Backend REST API - optional if using port 80)"
echo -e "  - TCP  3001     (WebSocket Server - optional if using port 80)"
echo -e "  - TCP  7880     (LiveKit SFU Signaling)"
echo -e "  - TCP  7881     (LiveKit WebRTC TCP fallback)"
echo -e "  - UDP  7882     (LiveKit WebRTC Audio/Video Stream - MUST BE UDP)"
echo -e "\nTo view logs at any time, run:"
echo -e "  docker compose -f ${COMPOSE_FILE} logs -f"
