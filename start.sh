#!/usr/bin/env bash
# Forgotten Cloud launcher: restarts the panel after self-updates shut it down.
cd "$(dirname "$0")"

while true; do
  echo "[$(date '+%H:%M:%S')] Starting Forgotten Cloud panel..."
  node dist/server/index.js
  echo
  echo "[$(date '+%H:%M:%S')] Panel exited. Restarting in 3 seconds (Ctrl+C twice to stop)..."
  sleep 3
done
