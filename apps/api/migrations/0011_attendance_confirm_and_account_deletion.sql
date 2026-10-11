-- U8: volunteers confirm they're still coming (from the reminder). U14: self-service account deletion.
ALTER TABLE request_commitments ADD COLUMN IF NOT EXISTS volunteer_confirmed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
