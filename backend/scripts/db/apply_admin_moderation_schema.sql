\set ON_ERROR_STOP on

-- Admin & Moderation schema bootstrap (used when RUN_MIGRATIONS=false and you want to apply schema once).
-- Usage (PowerShell):
--   $env:DATABASE_URL_ADMIN="postgres://postgres:<PASSWORD>@localhost:5433/thankyou"
--   psql $env:DATABASE_URL_ADMIN -v runtime_role=thankyou_app -f backend/scripts/db/apply_admin_moderation_schema.sql
--
-- Usage (bash):
--   export DATABASE_URL_ADMIN='postgres://postgres:<PASSWORD>@localhost:5433/thankyou'
--   psql "$DATABASE_URL_ADMIN" -v runtime_role=thankyou_app -f backend/scripts/db/apply_admin_moderation_schema.sql

BEGIN;

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Platform settings (singleton row id=1)
CREATE TABLE IF NOT EXISTS platform_settings (
  id INT PRIMARY KEY CHECK (id = 1),
  maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_message TEXT,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure singleton exists
INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
VALUES (1, FALSE, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

-- Audit for settings changes (optional but used by the admin console)
CREATE TABLE IF NOT EXISTS platform_settings_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL,
  changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_settings_audit_key_time_idx
  ON platform_settings_audit(setting_key, changed_at DESC);

-- Org incident reports (Safety & Trust → Incident Review)
CREATE TABLE IF NOT EXISTS org_incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
  request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
  volunteer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','closed')),
  internal_notes TEXT,
  outcome TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_incident_reports_org_idx ON org_incident_reports(org_slug);
CREATE INDEX IF NOT EXISTS org_incident_reports_req_idx ON org_incident_reports(request_id);
CREATE INDEX IF NOT EXISTS org_incident_reports_status_idx ON org_incident_reports(status);
CREATE INDEX IF NOT EXISTS org_incident_reports_sev_idx ON org_incident_reports(severity);

-- Strike / ban enforcement support (Admin → Strike / ban management)
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS strike_count INT NOT NULL DEFAULT 0;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS banned_by_user_id UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS user_enforcement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('strike', 'ban', 'unban', 'clear_strikes')),
  ban_until TIMESTAMPTZ,
  reason TEXT,
  notes TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_enforcement_actions_target_user_id_idx
  ON user_enforcement_actions(target_user_id);
CREATE INDEX IF NOT EXISTS user_enforcement_actions_created_at_idx
  ON user_enforcement_actions(created_at DESC);

-- Grants to runtime role (optional). Pass: -v runtime_role=thankyou_app
\if :{?runtime_role}
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform_settings TO :"runtime_role";
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform_settings_audit TO :"runtime_role";
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org_incident_reports TO :"runtime_role";
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE user_enforcement_actions TO :"runtime_role";
\endif

COMMIT;
