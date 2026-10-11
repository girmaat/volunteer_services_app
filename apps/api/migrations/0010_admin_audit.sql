-- 4.9 Every admin/moderator mutation is recorded here (settings keep their own detailed audit too).
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  method TEXT,
  path TEXT,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_code INT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON admin_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON admin_audit_log (target_type, target_id);
