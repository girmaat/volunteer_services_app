BEGIN;

-- Ensure bcrypt functions (crypt/gen_salt) are available.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Ensure RBAC table exists (for DBs where migrations have not been applied yet).
CREATE TABLE IF NOT EXISTS platform_admins (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','super')),
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

-- Helpful indexes (no-op if already created by migrations).
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS platform_admins_role_idx ON platform_admins(role);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS platform_admins_active_idx ON platform_admins(user_id) WHERE revoked_at IS NULL;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Upsert user + grant super admin.
WITH upsert_user AS (
  INSERT INTO users (
    email,
    password_hash,
    email_verified_at,
    profile_completed,
    availability_completed,
    onboarding_completed,
    updated_at
  )
  VALUES (
    'admin@admin.com',
    crypt('123456789', gen_salt('bf', 12)),
    NOW(),
    TRUE,
    TRUE,
    TRUE,
    NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    password_hash          = EXCLUDED.password_hash,
    email_verified_at      = COALESCE(users.email_verified_at, EXCLUDED.email_verified_at),
    profile_completed      = TRUE,
    availability_completed = TRUE,
    onboarding_completed   = TRUE,
    updated_at             = NOW()
  RETURNING id
)
INSERT INTO platform_admins (
  user_id,
  role,
  granted_by_user_id,
  granted_at,
  revoked_at,
  revoked_by_user_id,
  notes
)
SELECT
  id,
  'super',
  NULL,
  NOW(),
  NULL,
  NULL,
  'Seeded super admin (admin@admin.com) via SQL'
FROM upsert_user
ON CONFLICT (user_id) DO UPDATE SET
  role               = 'super',
  revoked_at         = NULL,
  revoked_by_user_id = NULL,
  granted_at         = NOW(),
  notes              = EXCLUDED.notes;

COMMIT;