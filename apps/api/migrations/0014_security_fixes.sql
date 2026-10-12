-- 0014: security audit fixes (2026-10-12).

-- ---- Organization join requests --------------------------------------------------------------------
-- "Join my team's organization" now asks an admin; nobody becomes staff by email domain alone.
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_status_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_status_check CHECK (status IN ('active', 'invited', 'requested'));
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

-- ---- Renaming an organization's web address --------------------------------------------------------
-- Every reference follows the slug (ON UPDATE CASCADE), so a rename is one UPDATE and nothing is
-- copied, deleted or orphaned. Delete rules stay as they were.
ALTER TABLE org_attendance_logs DROP CONSTRAINT IF EXISTS org_attendance_logs_org_slug_fkey,
  ADD CONSTRAINT org_attendance_logs_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE org_documents DROP CONSTRAINT IF EXISTS org_documents_org_slug_fkey,
  ADD CONSTRAINT org_documents_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE org_incident_reports DROP CONSTRAINT IF EXISTS org_incident_reports_org_slug_fkey,
  ADD CONSTRAINT org_incident_reports_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_org_slug_fkey,
  ADD CONSTRAINT organization_members_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_requester_org_slug_fkey,
  ADD CONSTRAINT service_requests_requester_org_slug_fkey FOREIGN KEY (requester_org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_active_org_slug_fkey,
  ADD CONSTRAINT sessions_active_org_slug_fkey FOREIGN KEY (active_org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE staff_conflicts DROP CONSTRAINT IF EXISTS staff_conflicts_org_slug_fkey,
  ADD CONSTRAINT staff_conflicts_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE CASCADE;

-- Contributions keep their org after a rename (and never point at a missing org).
UPDATE contributions c SET org_slug = r.requester_org_slug
  FROM service_requests r
 WHERE r.id = c.request_id AND c.org_slug IS NOT NULL AND r.requester_org_slug IS NOT NULL AND c.org_slug <> r.requester_org_slug;
UPDATE contributions c SET org_slug = NULL WHERE org_slug IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.slug = c.org_slug);
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_org_slug_fkey,
  ADD CONSTRAINT contributions_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE SET NULL;

-- ---- Session tokens are stored hashed --------------------------------------------------------------
-- The browser keeps the token; the database keeps a SHA-256-derived key, so a copy of the sessions
-- table can't be replayed as logins. Existing sessions are converted in place (nobody is signed out).
CREATE OR REPLACE FUNCTION session_key(token text) RETURNS uuid
  LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT substr(encode(sha256(convert_to(lower(token), 'UTF8')), 'hex'), 1, 32)::uuid $$;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hashed BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE sessions SET session_token = session_key(session_token::text), token_hashed = TRUE WHERE NOT token_hashed;
ALTER TABLE sessions ALTER COLUMN token_hashed SET DEFAULT TRUE;

-- ---- Email verification binds the password chosen at that sign-up -----------------------------------
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ---- Guardian consent requests: counted for rate limits --------------------------------------------
CREATE INDEX IF NOT EXISTS guardian_consents_volunteer_time_idx ON guardian_consents (volunteer_user_id, requested_at DESC);
