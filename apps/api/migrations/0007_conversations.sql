-- 4.6 Messaging: one conversation per request + volunteer (or a legacy direct pair); messages keep
-- living in direct_messages (existing stats read it) with a conversation id and a moderation status.
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'request' CHECK (kind IN ('request', 'direct')),
  request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
  org_slug TEXT REFERENCES organizations(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'archived')),
  ended_at TIMESTAMPTZ,
  ended_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (volunteer_user_id <> owner_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_request_volunteer_uidx ON conversations (request_id, volunteer_user_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_direct_pair_uidx
  ON conversations (LEAST(volunteer_user_id, owner_user_id), GREATEST(volunteer_user_id, owner_user_id)) WHERE request_id IS NULL;
CREATE INDEX IF NOT EXISTS conversations_volunteer_idx ON conversations (volunteer_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_owner_idx ON conversations (owner_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversations_org_idx ON conversations (org_slug, last_message_at DESC) WHERE org_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_reads (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Files shared in a thread (waivers, training docs). Stored in Postgres until object storage
-- (Phase 5); every upload is type-sniffed and size-limited before it is accepted.
CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  uploader_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  sha256 TEXT NOT NULL,
  scan_status TEXT NOT NULL DEFAULT 'clean' CHECK (scan_status IN ('pending', 'clean', 'rejected')),
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS message_attachments_conversation_idx ON message_attachments (conversation_id);

ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS held_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES message_attachments(id) ON DELETE SET NULL;
ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_status_check;
-- held: waiting for a moderator (link/keyword filter); shadow: sender is shadow-banned (only they see it).
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_status_check CHECK (status IN ('sent', 'held', 'rejected', 'shadow'));
CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx ON direct_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS direct_messages_held_idx ON direct_messages (created_at) WHERE status = 'held';

-- Backfill: existing messages tied to a request become that request's conversation; the rest become direct pairs.
WITH pairs AS (
  SELECT DISTINCT ON (r.id, CASE WHEN dm.sender_user_id = r.requester_user_id THEN dm.recipient_user_id ELSE dm.sender_user_id END)
         r.id AS request_id, r.requester_org_slug AS org_slug, r.requester_user_id AS owner,
         CASE WHEN dm.sender_user_id = r.requester_user_id THEN dm.recipient_user_id ELSE dm.sender_user_id END AS volunteer
    FROM direct_messages dm JOIN service_requests r ON r.id = dm.request_id
   WHERE dm.conversation_id IS NULL
)
INSERT INTO conversations (kind, request_id, application_id, org_slug, volunteer_user_id, owner_user_id)
SELECT 'request', p.request_id,
       (SELECT a.id FROM request_applications a WHERE a.request_id = p.request_id AND a.volunteer_user_id = p.volunteer ORDER BY a.created_at DESC LIMIT 1),
       p.org_slug, p.volunteer, p.owner
  FROM pairs p WHERE p.volunteer <> p.owner
ON CONFLICT DO NOTHING;

UPDATE direct_messages dm SET conversation_id = c.id
  FROM conversations c
 WHERE dm.conversation_id IS NULL AND c.request_id = dm.request_id
   AND ((dm.sender_user_id = c.volunteer_user_id AND dm.recipient_user_id = c.owner_user_id)
     OR (dm.sender_user_id = c.owner_user_id AND dm.recipient_user_id = c.volunteer_user_id));

INSERT INTO conversations (kind, volunteer_user_id, owner_user_id)
SELECT DISTINCT 'direct', LEAST(sender_user_id, recipient_user_id), GREATEST(sender_user_id, recipient_user_id)
  FROM direct_messages WHERE conversation_id IS NULL AND sender_user_id <> recipient_user_id
ON CONFLICT DO NOTHING;

UPDATE direct_messages dm SET conversation_id = c.id
  FROM conversations c
 WHERE dm.conversation_id IS NULL AND c.request_id IS NULL
   AND LEAST(dm.sender_user_id, dm.recipient_user_id) = LEAST(c.volunteer_user_id, c.owner_user_id)
   AND GREATEST(dm.sender_user_id, dm.recipient_user_id) = GREATEST(c.volunteer_user_id, c.owner_user_id);

UPDATE conversations c SET last_message_at = m.last
  FROM (SELECT conversation_id, MAX(created_at) AS last FROM direct_messages GROUP BY conversation_id) m
 WHERE m.conversation_id = c.id;
