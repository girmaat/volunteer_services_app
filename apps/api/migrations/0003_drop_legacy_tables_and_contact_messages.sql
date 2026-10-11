-- Legacy tables from an earlier data model; the app uses service_requests / request_* tables.
-- Verified unused by application code at this migration.
DROP TABLE IF EXISTS volunteer_applications;
DROP TABLE IF EXISTS volunteer_saved_opportunities;
DROP TABLE IF EXISTS volunteer_commitments;
DROP TABLE IF EXISTS opportunities;

-- Contact form submissions (previously discarded).
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled', 'spam')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at TIMESTAMPTZ,
  handled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON contact_messages(status, created_at DESC);
