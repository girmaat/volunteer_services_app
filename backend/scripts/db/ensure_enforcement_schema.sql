\set ON_ERROR_STOP on

-- Ensures enforcement / moderation schema exists for admin console pages.
-- Run with DATABASE_URL_ADMIN (owner/admin role), NOT the runtime app role.
-- Usage (repo root):
--   psql "$DATABASE_URL_ADMIN" -f backend/scripts/db/ensure_enforcement_schema.sql
-- Optional: also grant runtime role permissions:
--   psql "$DATABASE_URL_ADMIN" -v runtime_role=thankyou_app -f backend/scripts/db/ensure_enforcement_schema.sql

BEGIN;

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users columns (idempotent)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS strike_count INT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ NULL;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_reason TEXT NULL;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ NULL;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_by_user_id UUID REFERENCES users(id);

-- Enforcement log table
CREATE TABLE IF NOT EXISTS user_enforcement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('strike', 'ban', 'unban', 'clear_strikes')),
  ban_until TIMESTAMPTZ NULL,
  reason TEXT NULL,
  notes TEXT NULL,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_enforcement_actions_target_user_id_idx ON user_enforcement_actions(target_user_id);
CREATE INDEX IF NOT EXISTS user_enforcement_actions_created_at_idx ON user_enforcement_actions(created_at DESC);

-- Optional grants to runtime role
\if :{?runtime_role}
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_enforcement_actions TO :"runtime_role";
\endif

COMMIT;
