#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting API server..."
cd /app/apps/api
exec node --import tsx/esm dist/server.js
