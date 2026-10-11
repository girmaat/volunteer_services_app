-- Share Links schema (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  share_type TEXT NOT NULL CHECK (share_type IN ('PUBLIC_PAGE','IMPACT_STORY','ORGANIZATION','OPPORTUNITY','SERVICE_REQUEST','VOLUNTEER_PROFILE','INVITE')),
  target_ref TEXT NOT NULL,
  destination_path TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'link_only' CHECK (visibility IN ('public','link_only','logged_in_only','private')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  resolve_count INT NOT NULL DEFAULT 0,
  last_resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS share_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  user_agent TEXT,
  referer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS share_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_share_type_target ON share_links(share_type, target_ref);
CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_share_events_link ON share_events(share_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_reports_link ON share_reports(share_link_id, created_at DESC);


-- Moderation workflow columns for share link reports (idempotent upgrades)
ALTER TABLE share_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_review','resolved','dismissed')),
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action TEXT CHECK (action IN ('warn','block','unblock','clear','auto_block')),
  ADD COLUMN IF NOT EXISTS action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporter_ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS reporter_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS reporter_referer TEXT;

CREATE INDEX IF NOT EXISTS idx_share_reports_status ON share_reports(status, created_at DESC);

ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS moderation_state TEXT NOT NULL DEFAULT 'clean' CHECK (moderation_state IN ('clean','reported','blocked')),
  ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
  ADD COLUMN IF NOT EXISTS moderation_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS moderation_updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_reason TEXT,
  ADD COLUMN IF NOT EXISTS revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reported_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_share_links_moderation_state ON share_links(moderation_state, created_at DESC);
