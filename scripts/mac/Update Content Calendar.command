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

print_step() {
  print ""
  print "==> $1"
}

cd "$APP_DIR" || fail "Cannot find the app folder."

command -v git >/dev/null 2>&1 || fail "Git is not installed. Install Git from https://git-scm.com."
command -v npm >/dev/null 2>&1 || fail "npm is not available. Install Node.js 20+ from https://nodejs.org."

if [ ! -d ".git" ]; then
  fail "This folder is not connected to GitHub. Run the installer from GitHub first."
fi

print_step "Checking for local code changes"
if [ -n "$(git status --porcelain)" ]; then
  fail "There are local code changes in this folder. Commit or discard them before updating."
fi

print_step "Pulling latest app version"
git pull --ff-only

print_step "Installing package changes"
npm install

if grep -q "USER:PASSWORD@HOST" ".env"; then
  fail "DATABASE_URL is not configured yet. Open $APP_DIR/.env and paste the shared Supabase/Postgres URL."
fi

print_step "Updating database schema"
npm run db:push

print_step "Update complete"
print "You can now start the app:"
print "$APP_DIR/scripts/mac/Start Content Calendar.command"
print ""
print "Press Enter to close this window."
read -r _
