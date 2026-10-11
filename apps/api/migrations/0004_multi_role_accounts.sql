-- 4.1 One account, multiple roles.
-- A person can volunteer and request help with one account; organization membership stays in
-- organization_members. users.role is kept (read-only, legacy) until every reader is migrated.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('volunteer', 'requester')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

INSERT INTO user_roles (user_id, role)
SELECT id, role FROM users WHERE role IN ('volunteer', 'requester')
ON CONFLICT DO NOTHING;

-- The context a session is acting in: 'volunteer' | 'requester' | 'org:<slug>' | 'admin'.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_context TEXT;
UPDATE sessions SET active_context = 'org:' || active_org_slug WHERE active_org_slug IS NOT NULL AND active_context IS NULL;

-- Moderator: works queues (reports, sensitive requests, disputes) but cannot change settings or admins.
ALTER TABLE platform_admins DROP CONSTRAINT IF EXISTS platform_admins_role_check;
ALTER TABLE platform_admins ADD CONSTRAINT platform_admins_role_check CHECK (role IN ('moderator', 'admin', 'super'));

-- Shadow-ban: the user's content stays visible to them but to nobody else (4.9).
ALTER TABLE users ADD COLUMN IF NOT EXISTS shadow_banned BOOLEAN NOT NULL DEFAULT FALSE;
