import type { Pool } from "pg";

export async function ensureDbSchema(pool: Pool) {
  // Ensure required extension for UUID generation
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  // Public content tables (used by the web public pages)

  // Geocoding cache + geo fields (powers Nearby + recommendations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS geo_cache (
      query TEXT PRIMARY KEY,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_geo_cache_updated_at ON geo_cache(updated_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  
  // Seed / update the Home landing page (public content)
  await pool.query(`
    INSERT INTO public_pages (slug, title, body)
    VALUES (
      'home',
      'GiveBack — Where volunteering meets real needs',
      $$Find flexible volunteer opportunities, offer help to your community, and track your impact — all in one place.

Whether you’re an individual looking to do good, a neighbor requesting support, or an organization coordinating volunteers, GiveBack makes it easy to connect, communicate, and follow through.

Get started by browsing opportunities, or create a free account to apply, message, and log hours.$$
    )
    ON CONFLICT (slug) DO UPDATE
      SET title = EXCLUDED.title,
          body = EXCLUDED.body,
          updated_at = NOW();
  `);

await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      location TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      location TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('in-person','remote','hybrid')),
      organization_slug TEXT REFERENCES organizations(slug),
      tags TEXT[] NOT NULL DEFAULT '{}'::text[],
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS impact_stories (
      id SERIAL PRIMARY KEY,
      slug TEXT,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      body TEXT,
      cover_image_url TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Impact stories: add detail fields for public story pages
  await pool.query(`ALTER TABLE impact_stories ADD COLUMN IF NOT EXISTS slug TEXT;`);
  await pool.query(`ALTER TABLE impact_stories ADD COLUMN IF NOT EXISTS body TEXT;`);
  await pool.query(`ALTER TABLE impact_stories ADD COLUMN IF NOT EXISTS cover_image_url TEXT;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS impact_stories_slug_key ON impact_stories (slug);`);

  // Backfill slug/body so detail pages can render for existing records
  await pool.query(`
    UPDATE impact_stories
      SET slug = regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g') || '-' || id
    WHERE slug IS NULL OR slug = '';
  `);
  await pool.query(`
    UPDATE impact_stories
      SET body = excerpt
    WHERE body IS NULL OR body = '';
  `);


  // Backwards-compatible schema upgrades that only depend on tables already created above
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

  await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS organization_slug TEXT REFERENCES organizations(slug);`);
  await pool.query(`ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];`);

  // Minimal seed/backfill to ensure discovery cards can render org + tags even on existing DBs
  await pool.query(`
    INSERT INTO organizations (slug, name, summary, location)
    VALUES
      ('kind-hands-foundation', 'Kind Hands Foundation]', 'Nonprofit focused on supporting low-income families with food and supplies.]', 'Metro Area]'),
      ('open-hearts-initiative', 'Open Hearts Initiative]', 'Grassroots group coordinating neighborhood mutual aid and support.]', 'Various neighborhoods]')
    ON CONFLICT (slug) DO NOTHING;
  `);

  await pool.query(`
    UPDATE opportunities
    SET organization_slug = COALESCE(organization_slug, 'kind-hands-foundation'),
        tags = CASE WHEN tags IS NULL OR array_length(tags, 1) IS NULL THEN ARRAY['food','community','in-person']::text[] ELSE tags END
    WHERE title = 'Community Food Distribution Helper]';
  `);

  await pool.query(`
    UPDATE opportunities
    SET organization_slug = COALESCE(organization_slug, 'open-hearts-initiative'),
        tags = CASE WHEN tags IS NULL OR array_length(tags, 1) IS NULL THEN ARRAY['translation','remote','language']::text[] ELSE tags END
    WHERE title = 'Remote Language Volunteer]';
  `);

  // Core auth tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email_verified_at TIMESTAMPTZ,
      role TEXT CHECK (role IN ('volunteer','requester','org_admin') OR role IS NULL),
      profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
      availability_completed BOOLEAN NOT NULL DEFAULT FALSE,
      verification_required BOOLEAN NOT NULL DEFAULT FALSE,
      verification_status TEXT NOT NULL DEFAULT 'not_required'
        CHECK (verification_status IN ('not_required','required','submitted','approved','rejected')),
      onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backwards-compatible organization upgrade that depends on users existing
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);`);

// OrgReq: user-level discriminator for mutual exclusivity (no "act as" switching)
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT;`);
// Requester-mode discriminator: individual vs organization (selected during onboarding)
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS requester_mode TEXT;`);

// Platform admin + safety enforcement fields
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS strike_count INT NOT NULL DEFAULT 0;`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by_user_id UUID REFERENCES users(id);`);

// User verification audit fields (platform review)
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_by_user_id UUID REFERENCES users(id);`);
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_notes TEXT;`);

// Backfill account_type from existing role values
await pool.query(`
  UPDATE users
    SET account_type = CASE
      WHEN role = 'volunteer' THEN 'volunteer'
      WHEN role = 'requester' THEN 'individual_requester'
      WHEN role = 'org_admin' THEN 'org_team_member'
      ELSE account_type
    END
  WHERE account_type IS NULL;
`);

// OrgReq: enrich organizations for onboarding/profile completeness
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mission TEXT;`);
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url TEXT;`);
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS contact_email TEXT;`);
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;`);
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;`);
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);`);

  // Org verification (org-level, separate from user verification)
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_required BOOLEAN NOT NULL DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_required';`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_submission_notes TEXT;`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_notes TEXT;`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verified_by_user_id UUID REFERENCES users(id);`);

  // Core service request workflow tables (Requester/Volunteer matching)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','paused','closed')),
      location_text TEXT,
      mode TEXT CHECK (mode IN ('in-person','remote','hybrid')),
      needed_by TIMESTAMPTZ,
      tags TEXT[] NOT NULL DEFAULT '{}'::text[],
      requester_org_slug TEXT REFERENCES organizations(slug),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // service_requests: geo coords (derived from location_text, used for Nearby filtering)
  await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sr_location_lat_lng_idx ON service_requests(location_lat, location_lng);`);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_saved_requests (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, request_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','waitlisted','rejected','withdrawn','confirmed','completed','canceled')),
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // OrgReq Phase 4: assignment/audit fields for applications
  await pool.query(`ALTER TABLE request_applications ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES users(id);`);
  await pool.query(`ALTER TABLE request_applications ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE request_applications ADD COLUMN IF NOT EXISTS status_updated_by_user_id UUID REFERENCES users(id);`);

  // Ensure request_applications.status allows all workflow states (including waitlist + org/requester cancel).
  await pool.query(`ALTER TABLE request_applications DROP CONSTRAINT IF EXISTS request_applications_status_check;`);
  await pool.query(`
DO $$
BEGIN
  ALTER TABLE request_applications
    ADD CONSTRAINT request_applications_status_check
    CHECK (status IN ('pending','accepted','waitlisted','rejected','withdrawn','confirmed','completed','canceled'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_commitments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled','confirmed','canceled','completed')),
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Org Operations: attendance logs (check-in/out) per volunteer engagement
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_attendance_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      check_in_at TIMESTAMPTZ NOT NULL,
      check_out_at TIMESTAMPTZ,
      hours NUMERIC(10,2),
      notes TEXT,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS org_attendance_logs_org_idx ON org_attendance_logs(org_slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_attendance_logs_req_idx ON org_attendance_logs(request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_attendance_logs_vol_idx ON org_attendance_logs(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_attendance_logs_checkin_idx ON org_attendance_logs(check_in_at);`);
  await pool.query(`DROP INDEX IF EXISTS org_attendance_logs_open_unique;`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS org_attendance_logs_open_unique
    ON org_attendance_logs(org_slug, request_id, volunteer_user_id)
    WHERE check_out_at IS NULL;
  `);

  // Org Operations: incident reports (per request / volunteer)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_incident_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      volunteer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','closed')),
      internal_notes TEXT,
      outcome TEXT,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS org_incident_reports_org_idx ON org_incident_reports(org_slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_incident_reports_req_idx ON org_incident_reports(request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_incident_reports_status_idx ON org_incident_reports(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_incident_reports_sev_idx ON org_incident_reports(severity);`);

  // Org Operations: waiver/training documents + assignments + volunteer acknowledgements
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
      doc_type TEXT NOT NULL CHECK (doc_type IN ('waiver','training')),
      title TEXT NOT NULL,
      description TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      require_ack BOOLEAN NOT NULL DEFAULT TRUE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS org_documents_org_idx ON org_documents(org_slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS org_documents_type_idx ON org_documents(doc_type);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_document_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_document_id UUID NOT NULL REFERENCES org_documents(id) ON DELETE CASCADE,
      request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_document_id, request_id)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS org_document_assignments_req_idx ON org_document_assignments(request_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_document_acks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_document_id UUID NOT NULL REFERENCES org_documents(id) ON DELETE CASCADE,
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID REFERENCES service_requests(id) ON DELETE CASCADE,
      acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_document_id, volunteer_user_id, request_id)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS volunteer_document_acks_vol_idx ON volunteer_document_acks(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS volunteer_document_acks_req_idx ON volunteer_document_acks(request_id);`);


  // Volunteer history tables (impact, tasks, outcomes)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_impact_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      impact_date DATE NOT NULL DEFAULT CURRENT_DATE,
      hours NUMERIC(10,2) NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_task_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      task_date DATE NOT NULL DEFAULT CURRENT_DATE,
      task TEXT NOT NULL,
      duration_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_outcome_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      outcome_date DATE NOT NULL DEFAULT CURRENT_DATE,
      outcome TEXT NOT NULL,
      quantity NUMERIC(14,2),
      unit TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


  

  // Volunteer reputation tables (reviews) + feature flags (badges)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Default: badges disabled until explicitly enabled (DB-backed config, not a stub).
  await pool.query(`
    INSERT INTO feature_flags (key, enabled)
    VALUES ('badges', FALSE)
    ON CONFLICT (key) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      strengths TEXT,
      improvements TEXT,
      would_work_again BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);


// Badge awarding persistence (computed rules, but stored so UI can show "New" + history).
await pool.query(`
  CREATE TABLE IF NOT EXISTS volunteer_badge_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (volunteer_user_id, badge_id)
  );
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS volunteer_badge_state (
    volunteer_user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ
  );
`);

await pool.query(`CREATE INDEX IF NOT EXISTS vba_user_idx ON volunteer_badge_awards(volunteer_user_id, earned_at DESC);`);


  await pool.query(`CREATE INDEX IF NOT EXISTS vr_volunteer_user_id_idx ON volunteer_reviews(volunteer_user_id, created_at DESC);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS vr_unique_application_idx ON volunteer_reviews(request_application_id) WHERE request_application_id IS NOT NULL;`);


  // Requester reputation tables (reviews received as requester; left by volunteers)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS requester_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      request_application_id UUID REFERENCES request_applications(id) ON DELETE SET NULL,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
      strengths TEXT,
      improvements TEXT,
      would_work_again BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS rr_requester_user_id_idx ON requester_reviews(requester_user_id, created_at DESC);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS rr_unique_application_idx ON requester_reviews(request_application_id) WHERE request_application_id IS NOT NULL;`);


// Backwards-compatible upgrades for volunteer history tables (older DBs used different column names)
  // If your DB already had volunteer_impact_entries/volunteer_task_entries from an older migration,
  // CREATE TABLE IF NOT EXISTS won't add the new columns. These ALTERs do.
  await pool.query(`ALTER TABLE volunteer_impact_entries ADD COLUMN IF NOT EXISTS impact_date DATE`);
  await pool.query(`ALTER TABLE volunteer_task_entries ADD COLUMN IF NOT EXISTS task TEXT`);
  await pool.query(`ALTER TABLE volunteer_task_entries ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE volunteer_outcome_entries ADD COLUMN IF NOT EXISTS outcome_date DATE`);

  // If older columns exist, backfill the new columns so existing data shows up in the UI.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_impact_entries' AND column_name='entry_date'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_impact_entries' AND column_name='impact_date'
      ) THEN
        -- Older schemas may have entry_date as NOT NULL with no default; make it safe for new inserts.
        EXECUTE 'ALTER TABLE volunteer_impact_entries ALTER COLUMN entry_date DROP NOT NULL';
        EXECUTE 'ALTER TABLE volunteer_impact_entries ALTER COLUMN entry_date SET DEFAULT CURRENT_DATE';
        EXECUTE 'UPDATE volunteer_impact_entries SET impact_date = COALESCE(impact_date, entry_date, CURRENT_DATE)';
        EXECUTE 'UPDATE volunteer_impact_entries SET entry_date = COALESCE(entry_date, impact_date, CURRENT_DATE)';
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_impact_entries' AND column_name='impact_date'
      ) THEN
        EXECUTE 'UPDATE volunteer_impact_entries SET impact_date = COALESCE(impact_date, CURRENT_DATE)';
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_task_entries' AND column_name='description'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_task_entries' AND column_name='task'
      ) THEN
        -- Older schemas stored the text in 'description' and required it (NOT NULL).
        EXECUTE 'ALTER TABLE volunteer_task_entries ALTER COLUMN description DROP NOT NULL';
        EXECUTE 'ALTER TABLE volunteer_task_entries ALTER COLUMN description SET DEFAULT ''''';
        EXECUTE 'UPDATE volunteer_task_entries SET task = COALESCE(task, description, '''')';
        EXECUTE 'UPDATE volunteer_task_entries SET description = COALESCE(description, task, '''')';
      END IF;

      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_task_entries' AND column_name='duration_hours'
      ) THEN
        EXECUTE 'UPDATE volunteer_task_entries SET duration_hours = COALESCE(duration_hours, 0)';
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='volunteer_outcome_entries' AND column_name='outcome_date'
      ) THEN
        EXECUTE 'UPDATE volunteer_outcome_entries SET outcome_date = COALESCE(outcome_date, CURRENT_DATE) WHERE outcome_date IS NULL';
      END IF;
    END $$;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS sr_requester_user_id_idx ON service_requests(requester_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sr_status_updated_at_idx ON service_requests(status, updated_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vsr_user_id_idx ON volunteer_saved_requests(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ra_volunteer_user_id_idx ON request_applications(volunteer_user_id, updated_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ra_request_id_idx ON request_applications(request_id, updated_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS rc_volunteer_user_id_idx ON request_commitments(volunteer_user_id, start_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS rc_request_id_idx ON request_commitments(request_id, start_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

      -- Account identity (private)
      full_name TEXT,
      phone TEXT,

      -- Public profile (shown to others)
      display_name TEXT,
      avatar_url TEXT,
      public_location TEXT,

      -- Legacy field (pre-public_location). Kept for backward compatibility.
      location TEXT,

      bio TEXT,
      languages TEXT[] NOT NULL DEFAULT '{}'::text[],
      interaction_styles TEXT[] NOT NULL DEFAULT '{}'::text[],

      -- Broad availability labels shown before chat (weekdays/evenings/weekends)
      availability_windows TEXT[] NOT NULL DEFAULT '{}'::text[],

      -- Volunteer-specific (public/safety-safe)
      help_categories TEXT[] NOT NULL DEFAULT '{}'::text[],
      has_car BOOLEAN,
      can_lift_heavy BOOLEAN,
      stairs_ok BOOLEAN,
      pet_friendly BOOLEAN,
      service_radius_miles INT,
      experience TEXT,
      experience_tags TEXT[] NOT NULL DEFAULT '{}'::text[],

      -- Requester-specific (public)
      need_categories TEXT[] NOT NULL DEFAULT '{}'::text[],
      need_help_prompt TEXT,

      parking_available BOOLEAN,
      elevator_available BOOLEAN,
      stairs_present BOOLEAN,
      pickup_vs_dropoff TEXT,
      time_flexibility TEXT,

      pets_at_home BOOLEAN,
      smoke_free BOOLEAN,
      accessibility_needs TEXT,

      meet_in_public_first BOOLEAN,
      someone_else_present BOOLEAN,
      mask_preferred BOOLEAN,

      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
`);

    // users: optional phone verification timestamp
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;`);

// user_profiles: backwards-compatible profile field expansion (shared + volunteer-specific)
  // user_profiles: allow legal_name/full_name to be optional
  await pool.query(`ALTER TABLE user_profiles ALTER COLUMN full_name DROP NOT NULL;`);

  // user_profiles: geo coords (derived from public_location/location_text; never shown as exact address)
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS geo_updated_at TIMESTAMPTZ;`);

  // user_profiles: shared profile fields (requester + volunteer)
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS availability_windows TEXT[] NOT NULL DEFAULT '{}'::text[];`);

  // user_profiles: volunteer field expansion
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS experience_tags TEXT[] NOT NULL DEFAULT '{}'::text[];`);

  // user_profiles: requester-specific field expansion
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS need_categories TEXT[] NOT NULL DEFAULT '{}'::text[];`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS need_help_prompt TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS parking_available BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS elevator_available BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stairs_present BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pickup_vs_dropoff TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS time_flexibility TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pets_at_home BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS smoke_free BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS accessibility_needs TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS meet_in_public_first BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS someone_else_present BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mask_preferred BOOLEAN;`);

  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS public_location TEXT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT '{}'::text[];`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS interaction_styles TEXT[] NOT NULL DEFAULT '{}'::text[];`);

  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS help_categories TEXT[] NOT NULL DEFAULT '{}'::text[];`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS has_car BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS can_lift_heavy BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stairs_ok BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pet_friendly BOOLEAN;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS service_radius_miles INT;`);
  await pool.query(`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS experience TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_availability (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      timezone TEXT NOT NULL,
      days TEXT[] NOT NULL,
      hours_per_week INT NOT NULL,
      remote_ok BOOLEAN NOT NULL,
      in_person_ok BOOLEAN NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_token UUID NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  // Backwards-compatible sessions upgrade; sessions must exist before ALTER/INDEX.
  await pool.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_org_slug TEXT REFERENCES organizations(slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_active_org_slug ON sessions(active_org_slug);`);

  // Platform admins (site-wide administration + moderation)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin','super')),
      granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ,
      revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS platform_admins_role_idx ON platform_admins(role);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS platform_admins_active_idx ON platform_admins(user_id) WHERE revoked_at IS NULL;`);

  // Platform-level settings (global feature flags, maintenance mode)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id INT PRIMARY KEY CHECK (id = 1),
      maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      maintenance_message TEXT,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Ensure the singleton row exists
  await pool.query(
    `INSERT INTO platform_settings (id, maintenance_enabled, maintenance_message, updated_at)
     VALUES (1, FALSE, NULL, NOW())
     ON CONFLICT (id) DO NOTHING`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_settings_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      setting_key TEXT NOT NULL,
      setting_value JSONB NOT NULL,
      changed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS platform_settings_audit_key_time_idx ON platform_settings_audit(setting_key, changed_at DESC);`);

  // Moderation / enforcement audit trail
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_enforcement_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL CHECK (action_type IN ('strike','ban','unban','clear_strikes')),
      ban_until TIMESTAMPTZ,
      reason TEXT,
      notes TEXT,
      created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS uea_target_idx ON user_enforcement_actions(target_user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS uea_action_idx ON user_enforcement_actions(action_type, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS uea_created_by_idx ON user_enforcement_actions(created_by_user_id, created_at DESC);`);

  // Org membership / RBAC (organizational requesters)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_slug TEXT NOT NULL REFERENCES organizations(slug) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      invited_email TEXT,
      role TEXT NOT NULL CHECK (role IN ('admin','manager','member')),
      status TEXT NOT NULL CHECK (status IN ('active','invited')) DEFAULT 'active',
      invited_at TIMESTAMPTZ,
      joined_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_slug, user_id),
      UNIQUE (org_slug, invited_email)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_members_org_slug ON organization_members(org_slug);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members(user_id);`);

  // Org invites (email acceptance flow)
  await pool.query(`ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS invite_token_hash TEXT;`);
  await pool.query(`ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_invite_token_hash ON organization_members(invite_token_hash) WHERE invite_token_hash IS NOT NULL;`);


  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS evt_user_id_idx ON email_verification_tokens(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS prt_user_id_idx ON password_reset_tokens(user_id);`);

  // Volunteer activity (Discovery & engagement foundation)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_saved_opportunities (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opportunity_id INT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, opportunity_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opportunity_id INT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','waitlisted','rejected','withdrawn','confirmed','completed','canceled')),
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Service requests (requester -> volunteers)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      requester_org_slug TEXT REFERENCES organizations(slug) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paused','closed')),
      location_text TEXT,
      mode TEXT CHECK (mode IN ('in-person','remote','hybrid')),
      needed_by TIMESTAMPTZ,
      tags TEXT[] NOT NULL DEFAULT '{}'::text[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_saved_requests (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, request_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','waitlisted','rejected','withdrawn','confirmed','completed','canceled')),
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS request_commitments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      volunteer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled','confirmed','canceled','completed')),
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Backwards-compatible schema upgrades (idempotent, safe on older DBs).
  // Ensure columns expected by newer API/UI exist.
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS requester_user_id UUID;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS title TEXT;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS description TEXT;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS status TEXT;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS location_text TEXT;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS mode TEXT;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS needed_by TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS tags TEXT[];`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS requester_org_slug TEXT;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE IF EXISTS service_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;`);

  await pool.query(`UPDATE service_requests SET tags = '{}'::text[] WHERE tags IS NULL;`);
  await pool.query(`UPDATE service_requests SET status = 'open' WHERE status IS NULL;`);
  await pool.query(`UPDATE service_requests SET created_at = COALESCE(created_at, NOW()) WHERE created_at IS NULL;`);
  await pool.query(`UPDATE service_requests SET updated_at = COALESCE(updated_at, NOW()) WHERE updated_at IS NULL;`);

  await pool.query(`ALTER TABLE IF EXISTS opportunities ADD COLUMN IF NOT EXISTS location_text TEXT;`);
  await pool.query(`UPDATE opportunities SET location_text = location WHERE location_text IS NULL;`);

  await pool.query(`ALTER TABLE volunteer_applications ADD COLUMN IF NOT EXISTS message TEXT;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_commitments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      opportunity_id INT REFERENCES opportunities(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('scheduled','confirmed','canceled','completed')),
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );
  `);


// Opportunity-scoped chat threads: optional context keys (request/application).
await pool.query(`ALTER TABLE IF EXISTS direct_messages ADD COLUMN IF NOT EXISTS request_id UUID;`);
await pool.query(`ALTER TABLE IF EXISTS direct_messages ADD COLUMN IF NOT EXISTS application_id UUID;`);

// Add foreign keys if missing (Postgres-safe idempotent DO blocks).
await pool.query(`
  DO $$
  BEGIN
    ALTER TABLE direct_messages
      ADD CONSTRAINT direct_messages_request_id_fkey
      FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END $$;
`);

await pool.query(`
  DO $$
  BEGIN
    ALTER TABLE direct_messages
      ADD CONSTRAINT direct_messages_application_id_fkey
      FOREIGN KEY (application_id) REFERENCES request_applications(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END $$;
`);


  

  // Trust & Safety: Blocked users + Reports filed (shared Settings pages)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      blocker_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (blocker_user_id, blocked_user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      target_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted','in_review','resolved','dismissed')),
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
  `);

  // Notifications Center (derived feed): store per-user last-seen timestamp
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notification_state (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ
    );
  `);


// Sharing: tokenized share links + privacy-preserving tracking (used by /s/:token)
await pool.query(`
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
`);


// Keep share_links.share_type constraint up to date for existing DBs.
await pool.query(`ALTER TABLE share_links DROP CONSTRAINT IF EXISTS share_links_share_type_check;`);
await pool.query(`
DO $$
BEGIN
  ALTER TABLE share_links
    ADD CONSTRAINT share_links_share_type_check
    CHECK (share_type IN ('PUBLIC_PAGE','IMPACT_STORY','ORGANIZATION','OPPORTUNITY','SERVICE_REQUEST','VOLUNTEER_PROFILE','INVITE'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
`);



await pool.query(`
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
`);

await pool.query(`
  CREATE TABLE IF NOT EXISTS share_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
    reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);

await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_links_share_type_target ON share_links(share_type, target_ref);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_links_created_by ON share_links(created_by_user_id);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_events_link ON share_events(share_link_id, created_at DESC);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_reports_link ON share_reports(share_link_id, created_at DESC);`);



  // Privacy & Safety Settings (shared): public profile visibility + messaging permissions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_privacy_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      public_profile_visible BOOLEAN NOT NULL DEFAULT TRUE,
      messaging_permission TEXT NOT NULL DEFAULT 'anyone'
        CHECK (messaging_permission IN ('anyone','verified_only','no_one')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

await pool.query(`CREATE INDEX IF NOT EXISTS vso_user_id_idx ON volunteer_saved_opportunities(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS va_user_id_idx ON volunteer_applications(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vc_user_id_idx ON volunteer_commitments(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vsr_user_id_idx ON volunteer_saved_requests(user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ra_volunteer_user_id_idx ON request_applications(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ra_request_id_idx ON request_applications(request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS rc_volunteer_user_id_idx ON request_commitments(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS rc_request_id_idx ON request_commitments(request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dm_recipient_unread_idx ON direct_messages(recipient_user_id, read_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dm_user_pair_idx ON direct_messages(sender_user_id, recipient_user_id, created_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dm_thread_ctx_idx ON direct_messages(sender_user_id, recipient_user_id, request_id, application_id, created_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS dm_inbox_ctx_idx ON direct_messages(recipient_user_id, read_at, request_id, application_id, created_at DESC);`);

  
  await pool.query(`CREATE INDEX IF NOT EXISTS ub_blocker_idx ON user_blocks(blocker_user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ub_blocked_idx ON user_blocks(blocked_user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ur_reporter_idx ON user_reports(reporter_user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ur_target_user_idx ON user_reports(target_user_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ur_target_request_idx ON user_reports(target_request_id, created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS uns_last_seen_idx ON user_notification_state(last_seen_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ups_public_visible_idx ON user_privacy_settings(public_profile_visible);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ups_msg_perm_idx ON user_privacy_settings(messaging_permission);`);
await pool.query(`CREATE INDEX IF NOT EXISTS vie_user_id_idx ON volunteer_impact_entries(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vie_request_id_idx ON volunteer_impact_entries(request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vte_user_id_idx ON volunteer_task_entries(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vte_request_id_idx ON volunteer_task_entries(request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS voe_user_id_idx ON volunteer_outcome_entries(volunteer_user_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS voe_request_id_idx ON volunteer_outcome_entries(request_id);`);

}





