-- 0015: images we host (organization logos, profile photos). Pages never load images from other
-- sites, so a profile or logo can't be used to log viewers' IP addresses.
CREATE TABLE IF NOT EXISTS media_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  org_slug TEXT REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('avatar', 'logo')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes BYTEA NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_images_owner_idx ON media_images (owner_user_id);
CREATE INDEX IF NOT EXISTS media_images_org_idx ON media_images (org_slug);

-- Links to other sites are dropped (none exist in pilot data).
UPDATE user_profiles SET avatar_url = NULL WHERE avatar_url IS NOT NULL AND avatar_url !~ '^/media/[0-9a-f-]{36}$';
UPDATE organizations SET logo_url = NULL WHERE logo_url IS NOT NULL AND logo_url !~ '^/media/[0-9a-f-]{36}$';
