-- Idempotent schema patch for Admin & Moderation fields.
-- Run this once with an admin/owner connection (NOT the limited runtime role).

BEGIN;

-- Verification review audit fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by_user_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Strike / ban enforcement fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by_user_id UUID REFERENCES users(id);

COMMIT;
