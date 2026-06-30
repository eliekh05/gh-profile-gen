#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  🧬 gh-profile-gen — local development"
echo "  ─────────────────────────────────────"
echo ""

# ── Worker (wrangler dev) ─────────────────────────────────────────────────────
echo "  [1/2] Starting Cloudflare Worker…"
cd "$ROOT/worker"

if ! command -v node &>/dev/null; then
  echo "  ✗ node not found. Install Node.js 18+."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "       Installing deps…"
  npm install
fi

npx wrangler dev --port 8787 &
WORKER_PID=$!
echo "  ✓ Worker   → http://localhost:8787"

# ── Frontend (vite) ───────────────────────────────────────────────────────────
echo ""
echo "  [2/2] Starting Vite frontend…"
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  echo "       Installing deps…"
  npm install
fi

VITE_API_BASE="http://localhost:8787" npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend → http://localhost:5173"

trap "echo ''; echo '  Shutting down…'; kill $WORKER_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

echo ""
echo "  ─────────────────────────────────────"
echo "  Open http://localhost:5173"
echo "  Press Ctrl-C to stop"
echo ""

wait
