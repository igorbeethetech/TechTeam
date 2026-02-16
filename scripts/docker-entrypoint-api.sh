#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
cd /app/packages/database
npx prisma migrate deploy
echo "[entrypoint] Migrations complete."

echo "[entrypoint] Starting API server..."
cd /app
exec node apps/api/dist/server.js
