#!/usr/bin/env bash
set -euo pipefail

DB="${DATABASE_URL_MIGRATIONS:-${DATABASE_URL:-}}"
if [[ -z "$DB" ]]; then
  echo "DATABASE_URL_MIGRATIONS or DATABASE_URL is required" >&2
  exit 1
fi

psql "$DB" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/apply_sharing_schema.sql"
echo "Sharing schema applied."
