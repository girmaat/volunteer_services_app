import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient } from "pg";

/**
 * Local/staging seed data: one persona per UAT role plus a spread of requests.
 *
 *   pnpm db:seed            (idempotent: re-running updates the same rows)
 *
 * Password for every seeded account comes from SEED_PASSWORD (default only outside production).
 */

const DOMAIN = "thankyou.test";

type Persona = {
  key: string;
  email: string;
  fullName: string;
  displayName: string;
  role: "volunteer" | "requester" | "org_admin";
  accountType: "volunteer" | "individual_requester" | "org_team_member";
  requesterMode?: "individual" | "organization";
  location: string;
  lat: number;
  lng: number;
  helpCategories?: string[];
  experienceTags?: string[];
  remoteOk?: boolean;
  inPersonOk?: boolean;
  hasCar?: boolean;
  radius?: number;
  platformAdmin?: "super" | "admin" | "moderator";
  /** Member roles; defaults to `role` when it is volunteer/requester. */
  roles?: ("volunteer" | "requester")[];
  /** Identity checked by an admin (trust tier "trusted"). */
  trusted?: boolean;
  /** YYYY-MM-DD; adults by default. */
  birthDate?: string;
};

const PERSONAS: Persona[] = [
  { key: "admin", email: `admin@${DOMAIN}`, fullName: "Ada Admin", displayName: "Ada (Admin)", role: "volunteer", accountType: "volunteer", location: "Brooklyn, NY", lat: 40.6782, lng: -73.9442, platformAdmin: "super" },
  { key: "org_admin", email: `org.admin@${DOMAIN}`, fullName: "Olivia Ortiz", displayName: "Olivia", role: "org_admin", accountType: "org_team_member", location: "Queens, NY", lat: 40.7282, lng: -73.7949 },
  { key: "org_member", email: `org.member@${DOMAIN}`, fullName: "Marcus Lee", displayName: "Marcus", role: "org_admin", accountType: "org_team_member", location: "Queens, NY", lat: 40.7282, lng: -73.7949 },
  { key: "vol_local", email: `volunteer.local@${DOMAIN}`, fullName: "Valerie Nguyen", displayName: "Valerie", role: "volunteer", accountType: "volunteer", location: "Jersey City, NJ", lat: 40.7178, lng: -74.0431, helpCategories: ["food", "seniors", "transport"], experienceTags: ["driving", "cooking", "lifting"], remoteOk: false, inPersonOk: true, hasCar: true, radius: 15, trusted: true },
  { key: "vol_remote", email: `volunteer.remote@${DOMAIN}`, fullName: "Ravi Patel", displayName: "Ravi", role: "volunteer", accountType: "volunteer", location: "Hoboken, NJ", lat: 40.7433, lng: -74.0324, helpCategories: ["education", "tech", "translation"], experienceTags: ["tutoring", "spanish", "web design"], remoteOk: true, inPersonOk: false, hasCar: false, radius: 5 },
  { key: "requester", email: `requester@${DOMAIN}`, fullName: "Rose Martin", displayName: "Rose", role: "requester", accountType: "individual_requester", requesterMode: "individual", location: "Manhattan, NY", lat: 40.7831, lng: -73.9712 },
  { key: "dual", email: `dual.role@${DOMAIN}`, fullName: "Diego Alvarez", displayName: "Diego", role: "volunteer", accountType: "volunteer", location: "Newark, NJ", lat: 40.7357, lng: -74.1724, helpCategories: ["community", "food"], experienceTags: ["event setup"], remoteOk: true, inPersonOk: true, hasCar: true, radius: 20, roles: ["volunteer", "requester"] },
  { key: "moderator", email: `moderator@${DOMAIN}`, fullName: "Maya Moderator", displayName: "Maya (Moderator)", role: "volunteer", accountType: "volunteer", location: "Brooklyn, NY", lat: 40.6782, lng: -73.9442, platformAdmin: "moderator" },
  // A 17-year-old: minors' protections, guardian consent and age limits.
  { key: "teen", email: `teen.volunteer@${DOMAIN}`, fullName: "Tara Young", displayName: "Tara", role: "volunteer", accountType: "volunteer", location: "Jersey City, NJ", lat: 40.7178, lng: -74.0431, helpCategories: ["education", "food"], experienceTags: ["tutoring"], remoteOk: true, inPersonOk: true, radius: 10, birthDate: "minor" }
];

/** A birth date that keeps the persona the same age whenever the seed runs (minor: 17, otherwise 34). */
function birthDateFor(p: Persona) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - (p.birthDate === "minor" ? 17 : 34));
  d.setUTCDate(d.getUTCDate() - 30);
  return p.birthDate && p.birthDate !== "minor" ? p.birthDate : d.toISOString().slice(0, 10);
}

const ORGS = [
  { slug: "harbor-food-bank", name: "Harbor Food Bank", summary: "Neighborhood food pantry serving Queens families.", location: "Queens, NY", mission: "No neighbor goes hungry.", website: "https://example.org/harbor", verified: true },
  { slug: "bright-futures-tutoring", name: "Bright Futures Tutoring", summary: "Free online tutoring for middle and high school students.", location: "Remote", mission: "Every student deserves a mentor.", website: "https://example.org/bright", verified: false }
];

type Req = {
  title: string;
  description: string;
  mode: "in-person" | "remote" | "hybrid";
  location: string | null;
  lat?: number;
  lng?: number;
  tags: string[];
  daysOut: number;
  owner: "org" | "requester";
  org?: string;
  /** Phase 4.2 fields (defaults derived from tags). */
  category?: string;
  needed?: number;
  nice?: string[];
  address?: string;
  recurring?: string;
  requiresCar?: boolean;
  status?: "open" | "draft";
  review?: "approved" | "pending_review";
};

const TAG_CATEGORY: [string[], string][] = [
  [["food"], "food"],
  [["education", "tutoring", "reading", "math", "careers", "writing"], "tutoring"],
  [["translation", "spanish"], "translation"],
  [["transport", "driving"], "transport"],
  [["tech", "web design", "data", "forms"], "tech"],
  [["companionship"], "companionship"],
  [["finance-literacy"], "financial"],
  [["community", "event setup", "organizing", "outdoors"], "events"],
  [["lifting", "seniors"], "errands"]
];
const categoryFor = (r: Req) => r.category ?? TAG_CATEGORY.find(([keys]) => r.tags.some((t) => keys.includes(t)))?.[1] ?? "other";

const REQUESTS: Req[] = [
  { title: "Sort donations at the pantry", description: "Help sort and shelve canned goods before Saturday distribution. Closed-toe shoes required.", mode: "in-person", location: "Queens, NY", lat: 40.7282, lng: -73.7949, tags: ["food", "lifting"], daysOut: 3, owner: "org", org: "harbor-food-bank" },
  { title: "Saturday distribution shift", description: "Greet families, hand out produce boxes and keep the line moving.", mode: "in-person", location: "Queens, NY", lat: 40.7282, lng: -73.7949, tags: ["food", "community"], daysOut: 5, owner: "org", org: "harbor-food-bank", needed: 6, nice: ["spanish"], address: "87-10 Queens Blvd, Elmhurst, NY" },
  { title: "Deliver meals to homebound seniors", description: "Drive a short route delivering hot meals. Car required.", mode: "in-person", location: "Astoria, NY", lat: 40.7644, lng: -73.9235, tags: ["food", "seniors", "driving"], daysOut: 2, owner: "org", org: "harbor-food-bank", requiresCar: true, needed: 2 },
  { title: "Pantry inventory spreadsheet cleanup", description: "Tidy up our inventory spreadsheet and set up simple formulas.", mode: "remote", location: null, tags: ["tech", "data"], daysOut: 10, owner: "org", org: "harbor-food-bank" },
  { title: "Volunteer coordinator for holiday drive", description: "Help schedule volunteers for our holiday food drive (hybrid: 2 on-site evenings).", mode: "hybrid", location: "Queens, NY", lat: 40.7282, lng: -73.7949, tags: ["community", "organizing"], daysOut: 20, owner: "org", org: "harbor-food-bank" },
  { title: "Algebra tutoring (grade 8)", description: "Weekly 1-hour video sessions helping an 8th grader with algebra.", mode: "remote", location: null, tags: ["education", "tutoring", "math"], daysOut: 7, owner: "org", org: "bright-futures-tutoring" },
  { title: "College essay feedback", description: "Review two college application essays and leave comments.", mode: "remote", location: null, tags: ["education", "writing"], daysOut: 14, owner: "org", org: "bright-futures-tutoring" },
  { title: "Spanish–English homework help", description: "Bilingual volunteer to support ESL students with homework.", mode: "remote", location: null, tags: ["education", "translation", "spanish"], daysOut: 9, owner: "org", org: "bright-futures-tutoring" },
  { title: "Build a simple sign-up page", description: "Help us make a one-page sign-up form for new students.", mode: "remote", location: null, tags: ["tech", "web design"], daysOut: 21, owner: "org", org: "bright-futures-tutoring" },
  { title: "Reading buddy (grades 2–3)", description: "Read together over video for 30 minutes twice a week.", mode: "remote", location: null, tags: ["education", "reading"], daysOut: 6, owner: "org", org: "bright-futures-tutoring" },
  { title: "Help me carry groceries upstairs", description: "Fourth-floor walk-up; I need help bringing groceries up on Thursdays.", mode: "in-person", location: "Upper West Side, Manhattan, NY", lat: 40.787, lng: -73.9754, tags: ["seniors", "lifting"], daysOut: 4, owner: "requester" },
  { title: "Set up my new phone", description: "Help me transfer contacts and photos to a new smartphone.", mode: "hybrid", location: "Manhattan, NY", lat: 40.7831, lng: -73.9712, tags: ["tech", "seniors"], daysOut: 8, owner: "requester" },
  { title: "Explain my electricity bill", description: "I would like someone to walk me through a confusing bill over the phone.", mode: "remote", location: null, tags: ["finance-literacy", "seniors"], daysOut: 5, owner: "requester" },
  { title: "Walk and talk in the park", description: "Weekly 45-minute walk in Riverside Park for company and conversation.", mode: "in-person", location: "Riverside Park, Manhattan, NY", lat: 40.8013, lng: -73.9712, tags: ["seniors", "companionship"], daysOut: 3, owner: "requester" },
  { title: "Fill in an online benefits form", description: "Need help completing an online form; can share screen.", mode: "remote", location: null, tags: ["forms", "seniors"], daysOut: 12, owner: "requester" },
  { title: "Community garden weeding", description: "Join a Saturday morning weeding session. Gloves provided.", mode: "in-person", location: "Jersey City, NJ", lat: 40.7178, lng: -74.0431, tags: ["community", "outdoors"], daysOut: 6, owner: "org", org: "harbor-food-bank" },
  { title: "Translate a flyer to Spanish", description: "One-page event flyer needs a Spanish version.", mode: "remote", location: null, tags: ["translation", "spanish"], daysOut: 5, owner: "org", org: "harbor-food-bank" },
  { title: "Ride to a medical appointment", description: "Round-trip ride to a clinic appointment in Hoboken.", mode: "in-person", location: "Hoboken, NJ", lat: 40.7433, lng: -74.0324, tags: ["transport", "driving"], daysOut: 9, owner: "requester" },
  { title: "Event setup crew", description: "Set up tables and chairs for a neighborhood fundraiser.", mode: "in-person", location: "Newark, NJ", lat: 40.7357, lng: -74.1724, tags: ["community", "event setup", "lifting"], daysOut: 11, owner: "org", org: "harbor-food-bank" },
  { title: "Mock job interview practice", description: "30-minute video mock interviews for teens applying to summer jobs.", mode: "remote", location: null, tags: ["education", "careers"], daysOut: 15, owner: "org", org: "bright-futures-tutoring" },
  { title: "Weekly ESL conversation circle", description: "Lead a friendly 1-hour English conversation group for adult learners every Tuesday and Thursday evening.", mode: "remote", location: null, tags: ["education", "translation"], daysOut: 2, owner: "org", org: "bright-futures-tutoring", recurring: "FREQ=WEEKLY;BYDAY=TU,TH", needed: 3, nice: ["spanish"] },
  { title: "Help hanging curtains and a shelf", description: "Two curtain rods and one shelf in my apartment. I have a drill and anchors.", mode: "in-person", location: "Upper West Side, Manhattan, NY", lat: 40.787, lng: -73.9754, tags: ["home repair"], daysOut: 6, owner: "requester", category: "home-access", address: "250 W 85th St, Apt 3F, New York, NY", review: "pending_review", status: "draft" },
  { title: "Draft: garden cleanup (not published)", description: "Rake leaves in the shared backyard.", mode: "in-person", location: "Manhattan, NY", tags: ["outdoors"], daysOut: 12, owner: "requester", status: "draft" }
];

async function upsertUser(c: PoolClient, p: Persona, passwordHash: string): Promise<string> {
  const u = await c.query(
    `INSERT INTO users (email, password_hash, email_verified_at, role, account_type, requester_mode,
                        profile_completed, availability_completed, onboarding_completed)
     VALUES ($1, $2, NOW(), $3, $4, $5, TRUE, TRUE, TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role,
       account_type=EXCLUDED.account_type, requester_mode=EXCLUDED.requester_mode,
       email_verified_at=COALESCE(users.email_verified_at, NOW()), onboarding_completed=TRUE, updated_at=NOW()
     RETURNING id`,
    [p.email, passwordHash, p.role, p.accountType, p.requesterMode ?? null]
  );
  const id = String(u.rows[0].id);
  await c.query(
    `INSERT INTO user_profiles (user_id, full_name, display_name, public_location, location, bio, languages,
                                help_categories, experience_tags, has_car, service_radius_miles, geo_lat, geo_lng, geo_updated_at)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name, display_name=EXCLUDED.display_name,
       public_location=EXCLUDED.public_location, location=EXCLUDED.location, bio=EXCLUDED.bio,
       languages=EXCLUDED.languages, help_categories=EXCLUDED.help_categories, experience_tags=EXCLUDED.experience_tags,
       has_car=EXCLUDED.has_car, service_radius_miles=EXCLUDED.service_radius_miles,
       geo_lat=EXCLUDED.geo_lat, geo_lng=EXCLUDED.geo_lng, geo_updated_at=NOW(), updated_at=NOW()`,
    [id, p.fullName, p.displayName, p.location, `Seeded ${p.key} persona for local testing.`, ["English"],
     p.helpCategories ?? [], p.experienceTags ?? [], p.hasCar ?? null, p.radius ?? null, p.lat, p.lng]
  );
  await c.query("UPDATE user_profiles SET birth_date = $2::date, birth_year = EXTRACT(YEAR FROM $2::date)::int WHERE user_id = $1", [id, birthDateFor(p)]);
  if (p.role === "volunteer" || p.accountType === "individual_requester") {
    await c.query(
      `INSERT INTO user_availability (user_id, timezone, days, hours_per_week, remote_ok, in_person_ok)
       VALUES ($1, 'America/New_York', $2, 4, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET remote_ok=EXCLUDED.remote_ok, in_person_ok=EXCLUDED.in_person_ok, updated_at=NOW()`,
      [id, ["sat", "sun", "wed"], p.remoteOk ?? true, p.inPersonOk ?? true]
    );
  }
  const roles = p.roles ?? (p.role === "volunteer" || p.role === "requester" ? [p.role] : []);
  await c.query("DELETE FROM user_roles WHERE user_id = $1 AND NOT (role = ANY($2::text[]))", [id, roles]);
  for (const r of roles) await c.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, r]);
  await c.query(
    "UPDATE users SET verification_status = $2, verified_at = CASE WHEN $2 = 'approved' THEN COALESCE(verified_at, NOW()) ELSE NULL END WHERE id = $1",
    [id, p.trusted ? "approved" : "not_required"]
  );
  if (p.platformAdmin) {
    await c.query(
      `INSERT INTO platform_admins (user_id, role, notes) VALUES ($1, $2, 'seed')
       ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role, revoked_at=NULL`,
      [id, p.platformAdmin]
    );
  }
  return id;
}

async function main() {
  const isProd = process.env.NODE_ENV === "production";
  const password = process.env.SEED_PASSWORD || (isProd ? "" : "ThankYou-Local-2026!");
  if (!password) throw new Error("SEED_PASSWORD is required when NODE_ENV=production");
  if (isProd && process.env.ALLOW_PRODUCTION_SEED !== "true") throw new Error("Refusing to seed production (set ALLOW_PRODUCTION_SEED=true to override)");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const hash = await bcrypt.hash(password, 12);
    const ids: Record<string, string> = {};
    for (const p of PERSONAS) ids[p.key] = await upsertUser(c, p, hash);

    for (const o of ORGS) {
      await c.query(
        `INSERT INTO organizations (slug, name, summary, location, mission, website_url, contact_email, created_by_user_id,
                                    onboarding_completed, verification_status, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10)
         ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, summary=EXCLUDED.summary, location=EXCLUDED.location,
           mission=EXCLUDED.mission, website_url=EXCLUDED.website_url, verification_status=EXCLUDED.verification_status,
           verified_at=EXCLUDED.verified_at, onboarding_completed=TRUE, updated_at=NOW()`,
        [o.slug, o.name, o.summary, o.location, o.mission, o.website, `hello@${o.slug}.example.org`, ids.org_admin,
         o.verified ? "approved" : "required", o.verified ? new Date() : null]
      );
    }
    const members: [string, string, string][] = [
      ["harbor-food-bank", ids.org_admin, "admin"],
      ["harbor-food-bank", ids.org_member, "member"],
      ["bright-futures-tutoring", ids.org_admin, "admin"]
    ];
    for (const [slug, userId, role] of members) {
      await c.query(
        `INSERT INTO organization_members (org_slug, user_id, role, status, joined_at)
         SELECT $1, $2, $3, 'active', NOW()
         WHERE NOT EXISTS (SELECT 1 FROM organization_members WHERE org_slug=$1 AND user_id=$2)`,
        [slug, userId, role]
      );
    }

    await c.query("DELETE FROM service_requests WHERE title = ANY($1::text[])", [REQUESTS.map((r) => r.title)]);
    for (const r of REQUESTS) {
      const owner = r.owner === "org" ? ids.org_admin : ids.requester;
      const status = r.status ?? "open";
      const ins = await c.query(
        `INSERT INTO service_requests (requester_user_id, requester_org_slug, title, description, status, location_text, public_area, exact_address,
                                       mode, needed_by, starts_at, schedule_type, recurrence_rule, timezone, duration_minutes, tags,
                                       required_skills, nice_to_have_skills, category, volunteers_needed, requires_car, review_status,
                                       published_at, location_lat, location_lng)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, ''), $6, $7, $8,
                 date_trunc('day', NOW()) + ($9 || ' days')::interval + INTERVAL '14 hours',
                 date_trunc('day', NOW()) + ($9 || ' days')::interval + INTERVAL '14 hours',
                 $10, $11, 'America/New_York', 120, $12, $12, $13, $14, $15, $16, $17,
                 CASE WHEN $5 = 'open' THEN NOW() ELSE NULL END, $18, $19)
         RETURNING id`,
        [
          owner, r.owner === "org" ? r.org : null, r.title, r.description, status, r.location, r.address ?? null, r.mode, String(r.daysOut),
          r.recurring ? "recurring" : "one_time", r.recurring ?? null, r.tags, r.nice ?? [], categoryFor(r), r.needed ?? 1, r.requiresCar ?? false,
          r.review ?? "approved", r.lat ?? null, r.lng ?? null
        ]
      );
      await c.query("UPDATE service_requests s SET is_sensitive = rc.is_sensitive FROM request_categories rc WHERE rc.slug = s.category AND s.id = $1", [ins.rows[0].id]);
      await c.query(
        "INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_kind, reason) VALUES ($1, 'seed', NULL, $2, 'system', 'Seed data')",
        [ins.rows[0].id, status]
      );
    }
    await c.query("COMMIT");

    console.log("Seeded accounts (password from SEED_PASSWORD, or the local default documented in README):");
    for (const p of PERSONAS) console.log(`  ${p.key.padEnd(11)} ${p.email}`);
    console.log(`Seeded ${ORGS.length} organizations and ${REQUESTS.length} requests.`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
