#!/bin/bash
set -euo pipefail

ROOT="/Users/bigp16/Downloads/Professional/job-app-system"
NODE_BIN="/opt/homebrew/bin"
export PATH="$NODE_BIN:$PATH"
LOG="$ROOT/scripts/daily-discovery.log"

echo "=== $(date) ===" >> "$LOG"

cd "$ROOT/scrapers"
npx tsx src/runDiscovery.ts >> "$LOG" 2>&1

cd "$ROOT/api"
API_WAS_RUNNING=true
if ! curl -s -o /dev/null http://localhost:4000/api/health; then
  API_WAS_RUNNING=false
  npx tsx src/index.ts >> "$LOG" 2>&1 &
  API_PID=$!
  for i in $(seq 1 20); do
    curl -s -o /dev/null http://localhost:4000/api/health && break
    sleep 0.5
  done
fi

curl -s -X POST http://localhost:4000/api/notifications/summary >> "$LOG" 2>&1
echo "" >> "$LOG"

if [ "$API_WAS_RUNNING" = false ]; then
  kill "$API_PID" 2>/dev/null || true
fi
