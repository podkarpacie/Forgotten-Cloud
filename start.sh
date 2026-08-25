#!/usr/bin/env bash
# Forgotten Cloud launcher: bootstraps on first run, keeps the panel alive,
# and writes everything to .cloud/launcher.log.
cd "$(dirname "$0")"
mkdir -p .cloud
LOGFILE=".cloud/launcher.log"

{
  echo "=============================================="
  echo "[$(date '+%x %T')] Launcher session started (log: $(pwd)/$LOGFILE)"
  echo "=============================================="
} >> "$LOGFILE"
echo "Launcher session started (log: $(pwd)/.cloud/launcher.log)"

node --version >> "$LOGFILE" 2>&1 || true

if [ ! -d node_modules ]; then
  echo "[bootstrap] node_modules missing - installing dependencies..."
  echo "[$(date '+%T')] BOOTSTRAP: installing dependencies" >> "$LOGFILE"
  if command -v pnpm >/dev/null 2>&1; then pnpm install >> "$LOGFILE" 2>&1; else npm install --no-audit --no-fund >> "$LOGFILE" 2>&1; fi
  if [ $? -ne 0 ]; then
    echo "[bootstrap] FAILED - details in the log."
    echo "[$(date '+%T')] BOOTSTRAP FAILED at dependency install" >> "$LOGFILE"
    exit 1
  fi
  echo "[bootstrap] Dependencies installed."
fi

if [ ! -f dist/server/index.js ]; then
  echo "[bootstrap] dist missing - building panel..."
  echo "[$(date '+%T')] BOOTSTRAP: building panel" >> "$LOGFILE"
  if command -v pnpm >/dev/null 2>&1; then pnpm run build >> "$LOGFILE" 2>&1; else npm run build >> "$LOGFILE" 2>&1; fi
  if [ $? -ne 0 ]; then
    echo "[bootstrap] FAILED - details in the log."
    echo "[$(date '+%T')] BOOTSTRAP FAILED at build" >> "$LOGFILE"
    exit 1
  fi
  echo "[bootstrap] Build complete."
fi

echo "[bootstrap] Ready. Panel output follows."

while true; do
  echo
  echo "[$(date '+%T')] Starting Forgotten Cloud panel..."
  echo "[$(date '+%T')] PANEL START" >> "$LOGFILE"
  node dist/server/index.js 2>> "$LOGFILE"
  code=$?
  echo "[$(date '+%T')] PANEL EXITED code=$code" >> "$LOGFILE"
  echo
  echo "[$(date '+%T')] Panel exited (code=$code). Restarting in 3 seconds... Ctrl+C twice to stop."
  sleep 3
done
