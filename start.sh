#!/usr/bin/env bash
set -euo pipefail

# ── gh-profile-gen local dev launcher ────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  🧬 gh-profile-gen — local development"
echo "  ─────────────────────────────────────"
echo ""

# ── Backend ──────────────────────────────────────────────────────────────────
echo "  [1/2] Starting FastAPI backend…"
cd "$ROOT/backend"

if ! command -v python3 &>/dev/null; then
  echo "  ✗ python3 not found. Install Python 3.10+."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "       Creating virtualenv…"
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

# Optional: set GitHub token for higher API rate limits
# export GITHUB_TOKEN="ghp_…"

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✓ Backend  → http://localhost:8000"

# ── Frontend ─────────────────────────────────────────────────────────────────
echo ""
echo "  [2/2] Starting Vite frontend…"
cd "$ROOT/frontend"

if ! command -v node &>/dev/null; then
  echo "  ✗ node not found. Install Node.js 18+."
  kill $BACKEND_PID 2>/dev/null
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "       Installing npm deps…"
  npm install
fi

VITE_API_BASE="http://localhost:8000" npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend → http://localhost:5173"

# ── Cleanup on exit ──────────────────────────────────────────────────────────
trap "echo ''; echo '  Shutting down…'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

echo ""
echo "  ─────────────────────────────────────"
echo "  Open http://localhost:5173 in your browser"
echo "  Press Ctrl-C to stop"
echo ""

wait
