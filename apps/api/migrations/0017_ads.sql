-- 0017: advertisement panels on the public pages (left and right), managed by platform admins.
-- Each side has a master switch; each ad has its own switch, an optional start and an optional expiry.
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS ads_left_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ads_right_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body TEXT CHECK (body IS NULL OR length(body) <= 300),
  link_url TEXT CHECK (link_url IS NULL OR link_url ~ '^(https?://|/)'),
  image_url TEXT CHECK (image_url IS NULL OR image_url ~ '^/media/[0-9a-f-]{36}$'),
  placement TEXT NOT NULL DEFAULT 'left' CHECK (placement IN ('left', 'right')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS ads_live_idx ON ads (placement, sort_order) WHERE is_active;

ALTER TABLE media_images DROP CONSTRAINT IF EXISTS media_images_kind_check;
ALTER TABLE media_images ADD CONSTRAINT media_images_kind_check CHECK (kind IN ('avatar', 'logo', 'ad'));
