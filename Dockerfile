FROM node:20-alpine

# Install native build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy all package files
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install all deps (with native scripts enabled for better-sqlite3)
RUN npm ci

# Copy source files
COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/

# Build
RUN npm run build -w packages/shared
RUN npm run build -w apps/server

# Copy migrations to where compiled code expects them
COPY apps/server/src/db/migrations ./apps/server/dist/db/migrations

# Data directory (mounted as Railway volume)
RUN mkdir -p /data /data/backups

ENV NODE_ENV=production
ENV DB_PATH=/data/market.db

EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
