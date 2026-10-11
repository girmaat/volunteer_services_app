-- 4.2 Request model, categories and verification tiers; 4.3 lifecycle states; 4.5 location privacy.

-- Categories declare how sensitive they are and the minimum trust tier to post and to apply.
-- Sensitive categories need a verified poster, an admin review before going live, and verified volunteers.
-- Tiers: basic (email verified) < trusted (identity or reference checked by an admin);
-- a verified organization posts at the "trusted" level ("org_verified").
CREATE TABLE IF NOT EXISTS request_categories (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  min_post_tier TEXT NOT NULL DEFAULT 'basic' CHECK (min_post_tier IN ('basic', 'trusted')),
  min_apply_tier TEXT NOT NULL DEFAULT 'basic' CHECK (min_apply_tier IN ('basic', 'trusted')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO request_categories (slug, label, description, is_sensitive, min_post_tier, min_apply_tier, sort) VALUES
  ('food', 'Food & meals', 'Pantries, meal prep and delivery', FALSE, 'basic', 'basic', 10),
  ('tutoring', 'Tutoring & mentoring', 'Homework help, reading, test prep, career advice', FALSE, 'basic', 'basic', 20),
  ('events', 'Events & community', 'Setup, greeting, clean-ups, drives', FALSE, 'basic', 'basic', 30),
  ('errands', 'Errands & chores', 'Shopping, carrying, small chores', FALSE, 'basic', 'basic', 40),
  ('transport', 'Rides & delivery', 'Rides to appointments, pick-ups, drop-offs', FALSE, 'basic', 'basic', 50),
  ('tech', 'Tech help', 'Phones, computers, forms and websites', FALSE, 'basic', 'basic', 60),
  ('translation', 'Translation & language', 'Translating documents, conversation practice', FALSE, 'basic', 'basic', 70),
  ('companionship', 'Companionship', 'Walks, calls and visits in public places', FALSE, 'basic', 'basic', 80),
  ('skilled', 'Skilled & professional', 'Design, writing, data, accounting for nonprofits', FALSE, 'basic', 'basic', 90),
  ('home-access', 'Help inside a home', 'Repairs, moving, cleaning inside someone''s home', TRUE, 'trusted', 'trusted', 200),
  ('financial', 'Money & paperwork', 'Bills, benefits, budgeting — never handle money or passwords', TRUE, 'trusted', 'trusted', 210),
  ('medical', 'Health & medical', 'Accompanying to appointments, health-related support', TRUE, 'trusted', 'trusted', 220),
  ('children', 'Children & youth', 'Activities that involve minors', TRUE, 'trusted', 'trusted', 230),
  ('elderly-care', 'Elderly in-home care', 'Care visits in an older adult''s home', TRUE, 'trusted', 'trusted', 240),
  ('other', 'Something else', 'Anything that doesn''t fit above', FALSE, 'basic', 'basic', 900)
ON CONFLICT (slug) DO NOTHING;

-- Text helper that Postgres accepts in a generated column.
CREATE OR REPLACE FUNCTION immutable_array_to_string(arr TEXT[], sep TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string(arr, sep) $$;

-- Great-circle distance in miles (haversine). Plain SQL so it works on any Postgres without extensions;
-- a lat/lng bounding box on an index narrows rows first.
CREATE OR REPLACE FUNCTION geo_miles(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION, lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
  RETURNS DOUBLE PRECISION LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL ELSE
    3958.8 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )) END
$$;

ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS category TEXT REFERENCES request_categories(slug),
  ADD COLUMN IF NOT EXISTS required_skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nice_to_have_skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'flexible_window',
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INT,
  ADD COLUMN IF NOT EXISTS volunteers_needed INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_age INT,
  ADD COLUMN IF NOT EXISTS requires_background_check BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_training BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_waiver BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_car BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS equipment_notes TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS apply_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accessibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_area TEXT,
  ADD COLUMN IF NOT EXISTS exact_address TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_reason TEXT,
  ADD COLUMN IF NOT EXISTS removed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Lifecycle: draft → open → pending (some slots filled) → filled → completed; canceled from any live state.
-- "paused" (owner stops taking applicants for a while) is kept from the original app.
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
UPDATE service_requests SET status = 'canceled', canceled_at = COALESCE(canceled_at, updated_at), cancel_reason = COALESCE(cancel_reason, 'Closed by requester')
 WHERE status = 'closed';
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('draft', 'open', 'pending', 'filled', 'paused', 'completed', 'canceled'));
ALTER TABLE service_requests ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_schedule_type_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_schedule_type_check CHECK (schedule_type IN ('one_time', 'recurring', 'flexible_window'));
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_urgency_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_urgency_check CHECK (urgency IN ('low', 'normal', 'high'));
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_review_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_review_status_check CHECK (review_status IN ('approved', 'pending_review', 'rejected'));
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_volunteers_needed_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_volunteers_needed_check CHECK (volunteers_needed BETWEEN 1 AND 500);
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_min_age_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_min_age_check CHECK (min_age IS NULL OR min_age BETWEEN 13 AND 99);
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_window_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_window_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at);

-- Backfill existing rows: the old free-text location was already area-level ("Queens, NY").
UPDATE service_requests SET public_area = NULLIF(location_text, '') WHERE public_area IS NULL;
UPDATE service_requests SET published_at = created_at WHERE published_at IS NULL AND status <> 'draft';
UPDATE service_requests SET starts_at = needed_by, schedule_type = 'one_time' WHERE starts_at IS NULL AND needed_by IS NOT NULL;
UPDATE service_requests SET timezone = 'America/New_York' WHERE timezone IS NULL;
UPDATE service_requests SET required_skills = tags WHERE required_skills = '{}' AND tags IS NOT NULL;
UPDATE service_requests SET category = CASE
    WHEN tags && ARRAY['food'] THEN 'food'
    WHEN tags && ARRAY['education', 'tutoring', 'reading', 'math', 'careers'] THEN 'tutoring'
    WHEN tags && ARRAY['translation', 'spanish'] THEN 'translation'
    WHEN tags && ARRAY['transport', 'driving'] THEN 'transport'
    WHEN tags && ARRAY['tech', 'web design', 'data', 'forms'] THEN 'tech'
    WHEN tags && ARRAY['companionship'] THEN 'companionship'
    WHEN tags && ARRAY['finance-literacy'] THEN 'financial'
    WHEN tags && ARRAY['community', 'event setup', 'organizing', 'outdoors'] THEN 'events'
    WHEN tags && ARRAY['lifting', 'seniors'] THEN 'errands'
    ELSE 'other' END
 WHERE category IS NULL;
UPDATE service_requests r SET is_sensitive = c.is_sensitive FROM request_categories c WHERE c.slug = r.category;

-- Full-text search: title (A), skills and tags (B), description and area (C).
ALTER TABLE service_requests DROP COLUMN IF EXISTS search_tsv;
ALTER TABLE service_requests ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', immutable_array_to_string(required_skills, ' ') || ' ' || immutable_array_to_string(nice_to_have_skills, ' ') || ' ' || immutable_array_to_string(coalesce(tags, '{}'), ' ')), 'B') ||
  setweight(to_tsvector('english', coalesce(description, '') || ' ' || coalesce(public_area, '')), 'C')
) STORED;
CREATE INDEX IF NOT EXISTS service_requests_search_idx ON service_requests USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS service_requests_discover_idx ON service_requests (status, review_status, published_at DESC) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS service_requests_geo_idx ON service_requests (location_lat, location_lng) WHERE location_lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS service_requests_category_idx ON service_requests (category);
CREATE INDEX IF NOT EXISTS service_requests_starts_idx ON service_requests (starts_at);

-- Audit trail of every state change (4.3).
CREATE TABLE IF NOT EXISTS request_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_kind TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user', 'admin', 'system')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS request_status_events_request_idx ON request_status_events (request_id, created_at);
INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind, reason, created_at)
SELECT id, 'migrated', NULL, status, NULL, 'system', 'State at migration 0005', COALESCE(published_at, created_at)
  FROM service_requests r
 WHERE NOT EXISTS (SELECT 1 FROM request_status_events e WHERE e.request_id = r.id);

-- Organization profile to spec.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS preferred_skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_area TEXT,
  ADD COLUMN IF NOT EXISTS hours TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_preferred_contact_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_preferred_contact_check
  CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN ('in_app', 'email', 'phone'));

-- Volunteer profile to spec: optional background-check status (set by an admin) and birth year for age limits.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS background_check_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS background_check_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS birth_year INT;
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_background_check_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_background_check_check
  CHECK (background_check_status IN ('none', 'pending', 'cleared', 'expired'));
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_birth_year_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_birth_year_check CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);
