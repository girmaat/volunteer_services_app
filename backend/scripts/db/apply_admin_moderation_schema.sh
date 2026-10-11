#!/usr/bin/env bash
set -euo pipefail

RUNTIME_ROLE="${1:-thankyou_app}"

if [[ -z "${DATABASE_URL_ADMIN:-}" ]]; then
  echo "ERROR: DATABASE_URL_ADMIN is not set."
  echo "Example:"
  echo "  export DATABASE_URL_ADMIN='postgres://postgres:<PASSWORD>@localhost:5433/thankyou'"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql "$DATABASE_URL_ADMIN" -v runtime_role="$RUNTIME_ROLE" -f "$SCRIPT_DIR/apply_admin_moderation_schema.sql"
echo "Done."
