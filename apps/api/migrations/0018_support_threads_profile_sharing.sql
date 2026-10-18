-- girma-fixes #17: organization members can message the platform team ("support" threads).
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_kind_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_kind_check CHECK (kind IN ('request', 'direct', 'support'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS support_org_slug TEXT REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE SET NULL;
DROP INDEX IF EXISTS conversations_direct_pair_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_uidx
  ON conversations (LEAST(volunteer_user_id, owner_user_id), GREATEST(volunteer_user_id, owner_user_id)) WHERE request_id IS NULL AND kind = 'direct';
-- One support thread per person (the "volunteer" side is the person asking).
CREATE UNIQUE INDEX IF NOT EXISTS conversations_support_uidx ON conversations (volunteer_user_id) WHERE kind = 'support';

-- girma-fixes #12/#13: volunteer profiles are private. A volunteer shares them only through a link
-- they create; making a new link or revoking it cuts off every earlier link.
CREATE TABLE IF NOT EXISTS profile_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_share_links_active_uidx ON profile_share_links (user_id) WHERE revoked_at IS NULL;

-- What a shared profile shows besides accomplishments (which always show). Name and accomplishments on by default.
CREATE TABLE IF NOT EXISTS profile_share_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_name BOOLEAN NOT NULL DEFAULT TRUE,
  show_location BOOLEAN NOT NULL DEFAULT FALSE,
  show_about BOOLEAN NOT NULL DEFAULT FALSE,
  show_total_hours BOOLEAN NOT NULL DEFAULT TRUE,
  show_average_rating BOOLEAN NOT NULL DEFAULT FALSE,
  show_reviews_count BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
