-- Adds missing organization verification and profile columns needed by admin endpoints.
-- Safe to run multiple times (idempotent).
-- Run as DB owner/superuser (e.g., postgres or schema owner).

BEGIN;

-- Ensure core org profile columns used by admin queries exist
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mission TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

-- Org verification columns (admin verification review)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_required';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_submission_notes TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_by_user_id UUID REFERENCES users(id);

COMMIT;
