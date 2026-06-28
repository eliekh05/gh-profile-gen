#!/usr/bin/env bash
set -euo pipefail

# ── gh-profile-gen — Railway production start ─────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$ROOT/backend"

echo "Installing Python dependencies…"
pip install -r requirements.txt

echo "Starting FastAPI backend on 0.0.0.0:8000…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
