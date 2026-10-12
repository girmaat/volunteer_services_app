#!/usr/bin/env bash
# ThankYou — one-time setup for a tester's macOS or Linux laptop.
# Run from the project folder:   bash scripts/setup-tester.sh
# Needs: Node.js 22 and PostgreSQL 16 installed first (see docs/TESTER-SETUP.md).
# Safe to run again: it keeps existing .env files and only re-creates the test data.
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null || { echo "Missing: $1. $2"; exit 1; }; }
need node "Install Node.js 22 LTS (https://nodejs.org or 'brew install node@22')."
need psql "Install PostgreSQL 16 ('brew install postgresql@16' then 'brew services start postgresql@16', or apt install postgresql)."
[ "$(node -v | sed 's/v//;s/\..*//')" -ge 20 ] || { echo "Node $(node -v) is too old; install Node 22."; exit 1; }
command -v pnpm >/dev/null || { corepack enable; corepack prepare pnpm@10.28.0 --activate; }

read -rp "PostgreSQL port [5432]: " PGPORT; PGPORT=${PGPORT:-5432}
read -rp "PostgreSQL superuser name [postgres] (Homebrew: your macOS username): " PGSUPER; PGSUPER=${PGSUPER:-postgres}
read -rsp "Superuser password (Enter if none): " PGPASSWORD; echo; export PGPASSWORD
APP_PASS=thankyou_local_pw
q() { psql -h localhost -p "$PGPORT" -U "$PGSUPER" -d "${2:-postgres}" -tAc "$1"; }

[ -n "$(q "SELECT 1 FROM pg_roles WHERE rolname='thankyou_app'")" ] || q "CREATE ROLE thankyou_app LOGIN PASSWORD '$APP_PASS'" >/dev/null
[ -n "$(q "SELECT 1 FROM pg_database WHERE datname='thankyou_next'")" ] || q "CREATE DATABASE thankyou_next OWNER thankyou_app" >/dev/null
q "ALTER SCHEMA public OWNER TO thankyou_app" thankyou_next >/dev/null
unset PGPASSWORD

if [ ! -f apps/api/.env ]; then
  sed -e "s#^DATABASE_URL=.*#DATABASE_URL=postgres://thankyou_app:$APP_PASS@localhost:$PGPORT/thankyou_next#" \
      -e "s#^AUTH_RATE_LIMIT_PER_MINUTE=.*#AUTH_RATE_LIMIT_PER_MINUTE=60#" apps/api/.env.example > apps/api/.env
fi
[ -f apps/web/.env.local ] || cp apps/web/.env.example apps/web/.env.local

pnpm install
pnpm db:uat

echo
echo "Setup done. Start the app with:  pnpm dev"
echo "Then open http://localhost:3002 and sign in with any seed user (password: Password!)."
echo "Test cases: docs/uat/README.md"
