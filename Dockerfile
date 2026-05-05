# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install all dependencies (including devDeps for build)
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/

# Build shared package first, then server
RUN npm run build -w packages/shared
RUN npm run build -w apps/server

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install native deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install production deps only (with native rebuild)
RUN npm ci --omit=dev --ignore-scripts && \
    cd node_modules/better-sqlite3 && \
    npm rebuild

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Copy migrations (needed at runtime)
COPY apps/server/src/db/migrations ./apps/server/src/db/migrations

# Data directory (mounted as Railway volume)
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/market.db
ENV PORT=3001

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
