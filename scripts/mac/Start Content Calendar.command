#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_DIR="${SCRIPT_DIR:h:h}"

fail() {
  print ""
  print "ERROR: $1"
  print ""
  print "Press Enter to close this window."
  read -r _
  exit 1
}

cd "$APP_DIR" || fail "Cannot find the app folder."

command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org."
command -v npm >/dev/null 2>&1 || fail "npm is not available. Reinstall Node.js from https://nodejs.org."

if [ ! -f ".env" ]; then
  cp .env.example .env
fi

if grep -q "USER:PASSWORD@HOST" ".env"; then
  fail "DATABASE_URL is not configured yet. Open $APP_DIR/.env and paste the shared Supabase/Postgres URL."
fi

if [ ! -d "node_modules" ]; then
  npm install
fi

npm run db:push
open "http://localhost:3000" || true
npm run dev
