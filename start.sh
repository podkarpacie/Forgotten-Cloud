#!/usr/bin/env bash
# Forgotten Cloud launcher: bootstraps on first run, then keeps the panel alive.
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies..."
  if command -v pnpm >/dev/null 2>&1; then pnpm install; else npm install --no-audit --no-fund; fi
fi

if [ ! -f dist/server/index.js ]; then
  echo "First run: building panel..."
  if command -v pnpm >/dev/null 2>&1; then pnpm run build; else npm run build; fi
fi

while true; do
  echo "[$(date '+%H:%M:%S')] Starting Forgotten Cloud panel..."
  node dist/server/index.js
  echo
  echo "[$(date '+%H:%M:%S')] Panel exited. Restarting in 3 seconds (Ctrl+C twice to stop)..."
  sleep 3
done
