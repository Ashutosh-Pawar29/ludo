FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Copy root workspace manifests
COPY package.json bun.lock* ./

# Copy workspace package manifests for optimized layer caching
COPY packages/commons-ts/package.json ./packages/commons-ts/
COPY packages/db/package.json ./packages/db/
COPY apps/ws/package.json ./apps/ws/

# Install monorepo dependencies
RUN bun install --frozen-lockfile || bun install

# Copy source code of dependencies and WebSocket server
COPY packages/commons-ts/ ./packages/commons-ts/
COPY packages/db/ ./packages/db/
COPY apps/ws/ ./apps/ws/

WORKDIR /app/apps/ws

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["bun", "run", "index.ts"]
