-- Pilot requirements (requirements_document Draft 2): approved hours, verifiable records, age gate,
-- guardian consent, verified-only publishing, waitlist offers, versioned waivers, targets and units,
-- calendar updates and QR check-in.

-- ---- Age (ID-01, SAFE-01) -------------------------------------------------------------------------
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS birth_date DATE;
UPDATE user_profiles SET birth_date = make_date(birth_year, 1, 1) WHERE birth_date IS NULL AND birth_year IS NOT NULL;
-- Organization staff who sign up through the org form attest they're adults instead of giving a birth date.
ALTER TABLE users ADD COLUMN IF NOT EXISTS adult_attested_at TIMESTAMPTZ;

-- ---- Requests: target and unit, guardian consent, QR check-in, owner approval (REQ-01/05, GOV-01) ------
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS target_value NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS target_unit TEXT,
  ADD COLUMN IF NOT EXISTS min_contribution NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS allow_overfill BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_guardian_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS checkin_token TEXT,
  ADD COLUMN IF NOT EXISTS owner_approval TEXT,
  ADD COLUMN IF NOT EXISTS owner_approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS owner_approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_target_check CHECK (target_value IS NULL OR (target_value > 0 AND target_unit IS NOT NULL));
ALTER TABLE service_requests ADD CONSTRAINT service_requests_target_unit_check CHECK (target_unit IS NULL OR length(target_unit) BETWEEN 1 AND 40);
ALTER TABLE service_requests ADD CONSTRAINT service_requests_min_contribution_check CHECK (min_contribution IS NULL OR min_contribution > 0);
ALTER TABLE service_requests ADD CONSTRAINT service_requests_owner_approval_check CHECK (owner_approval IS NULL OR owner_approval IN ('pending', 'approved', 'rejected'));
CREATE UNIQUE INDEX IF NOT EXISTS service_requests_checkin_token_idx ON service_requests (checkin_token) WHERE checkin_token IS NOT NULL;

-- ---- Applications: partial offers and waitlist offers (REQ-05, REQ-07) -----------------------------
ALTER TABLE request_applications
  ADD COLUMN IF NOT EXISTS offered_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS accepted_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;
ALTER TABLE request_applications ADD CONSTRAINT request_applications_amounts_check
  CHECK ((offered_amount IS NULL OR offered_amount > 0) AND (accepted_amount IS NULL OR accepted_amount >= 0));
ALTER TABLE request_applications DROP CONSTRAINT IF EXISTS request_applications_status_check;
ALTER TABLE request_applications ADD CONSTRAINT request_applications_status_check
  CHECK (status IN ('pending', 'accepted', 'waitlisted', 'offered', 'offer_expired', 'rejected', 'withdrawn', 'confirmed', 'completed', 'canceled'));

-- ---- Calendar (CAL-01/02) and attendance method (CON-04) -------------------------------------------
ALTER TABLE request_commitments
  ADD COLUMN IF NOT EXISTS ics_sequence INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE org_attendance_logs ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE org_attendance_logs ADD CONSTRAINT org_attendance_logs_method_check CHECK (method IN ('staff', 'qr', 'manual'));

-- ---- Organizations: verification states, suspension, publication policy (ORG-02/05, GOV-01/02) -----
UPDATE organizations SET verification_status = 'required' WHERE verification_status = 'not_required';
ALTER TABLE organizations ALTER COLUMN verification_status SET DEFAULT 'required';
ALTER TABLE organizations ALTER COLUMN verification_required SET DEFAULT TRUE;
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS publication_policy TEXT NOT NULL DEFAULT 'owner_first_and_high_risk';
ALTER TABLE organizations ADD CONSTRAINT organizations_verification_status_check
  CHECK (verification_status IN ('required', 'submitted', 'needs_info', 'approved', 'rejected', 'suspended'));
ALTER TABLE organizations ADD CONSTRAINT organizations_publication_policy_check
  CHECK (publication_policy IN ('owner_all', 'owner_first_and_high_risk', 'delegated'));

-- ---- Contributions and their decisions (CON-01/05/06, DATA-03/04, REC-01) ---------------------------
CREATE TABLE IF NOT EXISTS contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
  org_slug TEXT,
  source TEXT NOT NULL CHECK (source IN ('check_in', 'completion', 'volunteer_report', 'outside')),
  attendance_log_id UUID UNIQUE REFERENCES org_attendance_logs(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  break_minutes INT NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 720),
  timezone TEXT,
  reported_hours NUMERIC(8, 2) CHECK (reported_hours IS NULL OR reported_hours >= 0),
  reported_units NUMERIC(10, 2) CHECK (reported_units IS NULL OR reported_units >= 0),
  unit TEXT,
  approved_hours NUMERIC(8, 2) CHECK (approved_hours IS NULL OR approved_hours >= 0),
  approved_units NUMERIC(10, 2) CHECK (approved_units IS NULL OR approved_units >= 0),
  status TEXT NOT NULL CHECK (status IN ('self_reported', 'pending', 'approved', 'adjusted', 'rejected', 'revision_requested', 'disputed', 'unverified')),
  verification_method TEXT NOT NULL CHECK (verification_method IN ('staff_check_in', 'qr_check_in', 'manual_attendance', 'marked_complete', 'volunteer_report', 'self_reported')),
  description TEXT,
  overlap_flag BOOLEAN NOT NULL DEFAULT FALSE,
  decided_at TIMESTAMPTZ,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS contributions_volunteer_idx ON contributions (volunteer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contributions_request_idx ON contributions (request_id);
CREATE INDEX IF NOT EXISTS contributions_org_status_idx ON contributions (org_slug, status);

CREATE TABLE IF NOT EXISTS contribution_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'approved', 'adjusted', 'rejected', 'revision_requested', 'resubmitted', 'corrected',
                                         'disputed', 'dispute_upheld', 'marked_unverified', 'conflict_declared',
                                         'blocked_self', 'blocked_conflict', 'blocked_overlap')),
  hours NUMERIC(8, 2),
  units NUMERIC(10, 2),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contribution_decisions_idx ON contribution_decisions (contribution_id, created_at);

-- Decision history is append-only: a correction is a new row, never an edit (DATA-04).
CREATE OR REPLACE FUNCTION forbid_update_contribution_decisions() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contribution_decisions is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS contribution_decisions_append_only ON contribution_decisions;
CREATE TRIGGER contribution_decisions_append_only BEFORE UPDATE ON contribution_decisions
  FOR EACH ROW EXECUTE FUNCTION forbid_update_contribution_decisions();

-- Staff who can't review a volunteer's hours (family, close relationship, themselves) (ID-05, GOV-04).
CREATE TABLE IF NOT EXISTS staff_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
  staff_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_slug, staff_user_id, volunteer_user_id)
);

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS contribution_id UUID REFERENCES contributions(id) ON DELETE SET NULL;
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_kind_check;
ALTER TABLE disputes ADD CONSTRAINT disputes_kind_check CHECK (kind IN ('review', 'no_show', 'late_cancel', 'hours', 'other'));

-- ---- Shareable service records (REC-02/03, ID-07) --------------------------------------------------
CREATE TABLE IF NOT EXISTS service_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  name_mode TEXT NOT NULL CHECK (name_mode IN ('display', 'legal')),
  contribution_ids UUID[] NOT NULL,
  snapshot JSONB NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_id UUID REFERENCES service_records(id) ON DELETE SET NULL,
  superseded_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS service_records_volunteer_idx ON service_records (volunteer_user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS service_records_contributions_idx ON service_records USING GIN (contribution_ids);

-- ---- Guardian consent (FORM-03, CASE-02) -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS guardian_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
  guardian_name TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  relationship TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'granted', 'declined', 'replaced')),
  signed_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS guardian_consents_lookup_idx ON guardian_consents (volunteer_user_id, request_id, requested_at DESC);

-- ---- Versioned waivers and signatures (FORM-01/02/04/05) -------------------------------------------
CREATE TABLE IF NOT EXISTS org_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES org_documents(id) ON DELETE CASCADE,
  version INT NOT NULL,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  sha256 TEXT NOT NULL,
  requires_resign BOOLEAN NOT NULL DEFAULT TRUE,
  change_note TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);
ALTER TABLE org_documents ADD COLUMN IF NOT EXISTS current_version INT NOT NULL DEFAULT 1;
INSERT INTO org_document_versions (document_id, version, title, file_name, mime_type, bytes, sha256, created_by_user_id, created_at)
SELECT d.id, 1, d.title, d.file_name, d.mime_type, d.bytes, encode(sha256(d.bytes), 'hex'), d.created_by_user_id, d.created_at
  FROM org_documents d
 WHERE NOT EXISTS (SELECT 1 FROM org_document_versions v WHERE v.document_id = d.id);

ALTER TABLE org_document_assignments ADD COLUMN IF NOT EXISTS required_before TEXT NOT NULL DEFAULT 'check_in';
ALTER TABLE org_document_assignments ADD CONSTRAINT org_document_assignments_required_before_check CHECK (required_before IN ('apply', 'check_in'));

ALTER TABLE volunteer_document_acks
  ADD COLUMN IF NOT EXISTS document_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sha256 TEXT,
  ADD COLUMN IF NOT EXISTS signer_name TEXT,
  ADD COLUMN IF NOT EXISTS signature_method TEXT NOT NULL DEFAULT 'acknowledged',
  ADD COLUMN IF NOT EXISTS presented_title TEXT;
ALTER TABLE volunteer_document_acks DROP CONSTRAINT IF EXISTS volunteer_document_acks_org_document_id_volunteer_user_id_r_key;
CREATE UNIQUE INDEX IF NOT EXISTS volunteer_document_acks_version_idx ON volunteer_document_acks (org_document_id, volunteer_user_id, request_id, document_version);
