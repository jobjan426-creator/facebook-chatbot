#!/bin/sh

cd /app/backend

echo "[startup] Running prisma db push..."
node /app/node_modules/prisma/build/index.js db push --accept-data-loss 2>&1 || echo "[startup] db push failed, continuing..."

echo "[startup] Running seed..."
node /app/node_modules/tsx/dist/cli.mjs prisma/seed.ts 2>&1 || echo "[startup] seed failed, continuing..."

echo "[startup] Starting server..."
exec node /app/backend/dist/server.js