-- 0013: fixes from the 2026-10-11 review.
--   * indexes for lookups the new hours features make on every applicant row
--   * two-step sign-in (TOTP) for staff and admins (SAFE-05)
--   * saved searches with alerts (VOL-03)

-- ---- Indexes ---------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS contributions_application_idx ON contributions (application_id) WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_attendance_logs_application_idx ON org_attendance_logs (request_application_id);
CREATE INDEX IF NOT EXISTS request_applications_request_status_idx ON request_applications (request_id, status);
CREATE INDEX IF NOT EXISTS guardian_consents_application_idx ON guardian_consents (application_id) WHERE application_id IS NOT NULL;

-- ---- Two-step sign-in ------------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT,
  ADD COLUMN IF NOT EXISTS mfa_pending_secret TEXT,
  ADD COLUMN IF NOT EXISTS mfa_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_recovery_hashes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT;

-- A password that checked out, waiting for the second step. Short-lived and single-use.
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mfa_challenges_user_idx ON mfa_challenges (user_id, created_at DESC);

-- ---- Saved searches --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- The discovery query string the volunteer saved (q, category, mode, radius, tab…).
  query TEXT NOT NULL CHECK (char_length(query) <= 1000),
  alerts BOOLEAN NOT NULL DEFAULT TRUE,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON saved_searches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saved_searches_due_idx ON saved_searches (last_checked_at) WHERE alerts;
