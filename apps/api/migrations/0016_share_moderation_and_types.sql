-- 0016: (a) the share-link moderation columns the admin tools were written for but never created
--       (reports couldn't be resolved; warn/clear always failed), and
--       (b) release-2 readiness: typed contributions and requests, organization types, evidence.

-- ---- (a) Share-link reports and moderation ---------------------------------------------------------
ALTER TABLE share_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporter_ip_hash TEXT;
ALTER TABLE share_reports DROP CONSTRAINT IF EXISTS share_reports_status_check;
ALTER TABLE share_reports ADD CONSTRAINT share_reports_status_check CHECK (status IN ('submitted', 'in_review', 'resolved', 'dismissed'));

ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_moderation_state_check;
ALTER TABLE share_links ADD CONSTRAINT share_links_moderation_state_check CHECK (moderation_state IN ('clean', 'reported', 'blocked'));
UPDATE share_links l SET moderation_state = 'reported' WHERE EXISTS (SELECT 1 FROM share_reports r WHERE r.share_link_id = l.id) AND moderation_state = 'clean';

-- ---- (b) Typed work, ready for release 2 (DATA-02) -------------------------------------------------
-- What a request asks for. Release 1 runs 'shift' (people for a time) and 'units' (a countable output:
-- meals packed, pages translated). 'deliverable' (milestones, evidence) and 'goods' (in-kind
-- donations: receipt, condition, disposition) are reserved so release 2 adds flows, not remapping.
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS work_type TEXT NOT NULL DEFAULT 'shift';
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_work_type_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_work_type_check CHECK (work_type IN ('shift', 'units', 'deliverable', 'goods'));
UPDATE service_requests SET work_type = 'units' WHERE target_unit IS NOT NULL AND lower(target_unit) <> 'hours' AND work_type = 'shift';

-- What a contribution is. Goods never carry hours (CON-03), so they can't reach hour totals.
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'time';
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_kind_check;
ALTER TABLE contributions ADD CONSTRAINT contributions_kind_check CHECK (kind IN ('time', 'units', 'deliverable', 'goods'));
UPDATE contributions SET kind = 'units' WHERE kind = 'time' AND reported_hours IS NULL AND approved_hours IS NULL AND (reported_units IS NOT NULL OR approved_units IS NOT NULL);
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_goods_no_hours;
ALTER TABLE contributions ADD CONSTRAINT contributions_goods_no_hours CHECK (kind <> 'goods' OR (reported_hours IS NULL AND approved_hours IS NULL));

-- Evidence for a contribution (CON-02/07): a link or a file, added by the volunteer or a reviewer.
CREATE TABLE IF NOT EXISTS contribution_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('link', 'file')),
  url TEXT CHECK (url IS NULL OR url ~ '^https?://'),
  label TEXT,
  file_name TEXT,
  mime_type TEXT,
  bytes BYTEA,
  sha256 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((kind = 'link' AND url IS NOT NULL AND bytes IS NULL) OR (kind = 'file' AND bytes IS NOT NULL AND url IS NULL))
);
CREATE INDEX IF NOT EXISTS contribution_evidence_idx ON contribution_evidence (contribution_id, created_at);

-- ---- Organization types and the coordinator role ---------------------------------------------------
-- A school is an organization of type 'school'. Its staff can include coordinators, who curate
-- opportunities and (in release 2) review student records against school rules. In release 1 a
-- coordinator has member-level access.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_type TEXT NOT NULL DEFAULT 'nonprofit';
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_org_type_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_org_type_check CHECK (org_type IN ('nonprofit', 'school', 'community_group', 'faith_based', 'government', 'other'));
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_role_check CHECK (role IN ('admin', 'manager', 'member', 'coordinator'));

-- ---- Retired: the free-form volunteer log (replaced by contributions in 0012) ----------------------
-- Entries are kept as self-reported contributions (never counted as approved), then the tables go.
DO $$
BEGIN
  IF to_regclass('public.volunteer_impact_entries') IS NOT NULL THEN
    INSERT INTO contributions (volunteer_user_id, request_id, source, started_at, reported_hours, status, verification_method, description, kind, created_at)
    SELECT volunteer_user_id, NULL, 'outside', impact_date::timestamptz, hours, 'self_reported', 'self_reported', notes, 'time', created_at
      FROM volunteer_impact_entries WHERE hours IS NOT NULL;
  END IF;
  IF to_regclass('public.volunteer_task_entries') IS NOT NULL THEN
    INSERT INTO contributions (volunteer_user_id, request_id, source, started_at, reported_hours, status, verification_method, description, kind, created_at)
    SELECT volunteer_user_id, NULL, 'outside', task_date::timestamptz, duration_hours, 'self_reported', 'self_reported', task, 'time', created_at
      FROM volunteer_task_entries;
  END IF;
  IF to_regclass('public.volunteer_outcome_entries') IS NOT NULL THEN
    INSERT INTO contributions (volunteer_user_id, request_id, source, started_at, reported_units, unit, status, verification_method, description, kind, created_at)
    SELECT volunteer_user_id, NULL, 'outside', outcome_date::timestamptz, quantity, unit, 'self_reported', 'self_reported', outcome, 'units', created_at
      FROM volunteer_outcome_entries WHERE quantity IS NOT NULL AND unit IS NOT NULL;
  END IF;
END $$;
DROP TABLE IF EXISTS volunteer_impact_entries;
DROP TABLE IF EXISTS volunteer_task_entries;
DROP TABLE IF EXISTS volunteer_outcome_entries;
