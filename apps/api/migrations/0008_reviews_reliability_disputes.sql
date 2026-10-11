-- 4.7 Reviews: structured fields, double-blind release; reliability on commitments; disputes (4.9).
ALTER TABLE volunteer_reviews
  ADD COLUMN IF NOT EXISTS reliability INT CHECK (reliability BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS communication INT CHECK (communication BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS skill INT CHECK (skill BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS visible_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE requester_reviews
  ADD COLUMN IF NOT EXISTS reliability INT CHECK (reliability BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS communication INT CHECK (communication BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS clarity INT CHECK (clarity BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS visible_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Reviews written before double-blind existed stay visible.
UPDATE volunteer_reviews SET visible_at = created_at WHERE visible_at IS NULL;
UPDATE requester_reviews SET visible_at = created_at WHERE visible_at IS NULL;

-- Everything that shows reviews to other people reads these views.
CREATE OR REPLACE VIEW visible_volunteer_reviews AS
  SELECT * FROM volunteer_reviews WHERE visible_at IS NOT NULL AND visible_at <= NOW() AND removed_at IS NULL;
CREATE OR REPLACE VIEW visible_requester_reviews AS
  SELECT * FROM requester_reviews WHERE visible_at IS NOT NULL AND visible_at <= NOW() AND removed_at IS NULL;

-- When the work was completed (starts the 14-day review window).
ALTER TABLE request_applications ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
UPDATE request_applications SET completed_at = COALESCE(status_updated_at, updated_at) WHERE status = 'completed' AND completed_at IS NULL;

-- Reliability: late cancellations (< 24 h before start) and no-shows, recorded on the commitment.
ALTER TABLE request_commitments
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_by TEXT CHECK (canceled_by IN ('volunteer', 'owner', 'system')),
  ADD COLUMN IF NOT EXISTS late_cancel BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS no_show BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS no_show_marked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_marked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
  request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('review', 'no_show', 'late_cancel', 'other')),
  review_table TEXT CHECK (review_table IN ('volunteer_reviews', 'requester_reviews')),
  review_id UUID,
  opened_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'overturned', 'dismissed')),
  decision_notes TEXT,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON disputes (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_open_idx ON disputes (application_id, kind, opened_by_user_id) WHERE status = 'open';
