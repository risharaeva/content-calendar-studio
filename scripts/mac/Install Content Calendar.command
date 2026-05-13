#!/bin/zsh
set -euo pipefail

REPO_URL="https://github.com/risharaeva/content-calendar-studio.git"
APP_DIR="$HOME/Documents/content-calendar-studio"

print_step() {
  print ""
  print "==> $1"
}

fail() {
  print ""
  print "ERROR: $1"
  print ""
  print "Press Enter to close this window."
  read -r _
  exit 1
}

print_step "Checking required tools"
command -v git >/dev/null 2>&1 || fail "Git is not installed. Install Git from https://git-scm.com and run this file again."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install Node.js 20+ from https://nodejs.org and run this file again."
command -v npm >/dev/null 2>&1 || fail "npm is not available. Reinstall Node.js from https://nodejs.org and run this file again."

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ is required. Current version is $(node -v). Install the current LTS version from https://nodejs.org."
fi

if [ -d "$APP_DIR/.git" ]; then
  print_step "Project already exists. Pulling latest changes"
  cd "$APP_DIR"
  git pull --ff-only
else
  print_step "Cloning project into $APP_DIR"
  mkdir -p "$HOME/Documents"
  if [ -e "$APP_DIR" ]; then
    fail "$APP_DIR already exists but is not a Git repository. Rename or remove it, then run this installer again."
  fi
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

print_step "Creating local environment file"
if [ ! -f ".env" ]; then
  cp .env.example .env
fi

print_step "Installing packages"
npm install

print_step "Preparing local database"
npm run db:push

print_step "Seeding starter data"
npm run db:seed

print_step "Installation complete"
print "Project folder: $APP_DIR"
print ""
print "To start the app later, double-click:"
print "$APP_DIR/scripts/mac/Start Content Calendar.command"
print ""
print "Starting the app now..."
open "http://localhost:3000" || true
npm run dev
