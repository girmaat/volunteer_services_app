import { readFileSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import bcrypt from "bcryptjs";
import pg from "pg";

/**
 * Shared fixtures for the UAT specs.
 *
 * Signing in: seeded personas and users created here get a session row written straight to the
 * database, so the suite never trips the 5-per-minute login limit. The specs that are about
 * signing in (U1, U2, U14) use the real forms.
 */

function envFromApiDotenv(key: string): string | undefined {
  try {
    const text = readFileSync(path.join(__dirname, "..", "apps", "api", ".env"), "utf8");
    const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

export const API = process.env.E2E_API_URL || "http://localhost:4000";
export const DATABASE_URL = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL || envFromApiDotenv("DATABASE_URL") || "postgres://postgres@localhost:5433/ty_dev";
export const db = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

export const PASSWORD = "E2e-Password-2026!";
export const SEED_PASSWORD = process.env.SEED_PASSWORD || "ThankYou-Local-2026!";
export const PERSONAS = {
  admin: "admin@thankyou.test",
  moderator: "moderator@thankyou.test",
  orgAdmin: "org.admin@thankyou.test",
  volunteer: "volunteer.local@thankyou.test",
  requester: "requester@thankyou.test",
  dual: "dual.role@thankyou.test"
} as const;

/** Unique, readable suffix for names created in this run. */
export const run = Date.now().toString(36);
let seq = 0;
export const uniq = (prefix: string) => `${prefix} ${run}-${++seq}`;
export const uniqEmail = (who: string) => `e2e.${who}.${run}.${++seq}@example.test`;

let hash: string | null = null;

/** Creates a fully onboarded user straight in the database (what the API's own tests do). */
export async function createUser(opts: {
  email?: string;
  name: string;
  roles?: ("volunteer" | "requester")[];
  trusted?: boolean;
  location?: { label: string; lat: number; lng: number };
  skills?: string[];
  hasCar?: boolean;
  /** YYYY-MM-DD; adults by default. */
  birthDate?: string;
}): Promise<{ id: string; email: string; name: string }> {
  hash ??= await bcrypt.hash(PASSWORD, 6);
  const email = opts.email ?? uniqEmail(opts.name.split(" ")[0].toLowerCase());
  const roles = opts.roles ?? ["volunteer"];
  const legacy = roles[0];
  const u = await db.query(
    `INSERT INTO users (email, password_hash, email_verified_at, role, account_type, profile_completed, availability_completed, onboarding_completed, verification_status, verified_at)
     VALUES ($1, $2, NOW(), $3, $4, TRUE, TRUE, TRUE, $5, CASE WHEN $5 = 'approved' THEN NOW() END)
     RETURNING id`,
    [email, hash, legacy, legacy === "requester" ? "individual_requester" : "volunteer", opts.trusted ? "approved" : "not_required"]
  );
  const id = String(u.rows[0].id);
  const loc = opts.location ?? { label: "Astoria, Queens, NY", lat: 40.7644, lng: -73.9235 };
  await db.query(
    `INSERT INTO user_profiles (user_id, full_name, display_name, public_location, location, help_categories, experience_tags, service_radius_miles, has_car, geo_lat, geo_lng, geo_updated_at, birth_date)
     VALUES ($1, $2, $3, $4, $4, $5, $5, 25, $6, $7, $8, NOW(), $9::date)`,
    [id, opts.name, opts.name.split(" ")[0], loc.label, opts.skills ?? ["lifting", "errands"], Boolean(opts.hasCar), loc.lat, loc.lng, opts.birthDate ?? "1990-05-01"]
  );
  await db.query(
    `INSERT INTO user_availability (user_id, timezone, days, hours_per_week, remote_ok, in_person_ok)
     VALUES ($1, 'America/New_York', $2, 4, TRUE, TRUE) ON CONFLICT (user_id) DO NOTHING`,
    [id, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]]
  );
  for (const r of roles) await db.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, r]);
  return { id, email, name: opts.name };
}

/** A fresh session token for a user (by email), written straight to the sessions table. */
export async function sessionFor(email: string): Promise<string> {
  const u = await db.query("SELECT id FROM users WHERE email = $1", [email]);
  if (!u.rowCount) throw new Error(`No user ${email}. Is the database seeded (pnpm db:seed)?`);
  const s = await db.query("INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, gen_random_uuid(), NOW() + INTERVAL '1 day') RETURNING session_token", [u.rows[0].id]);
  return String(s.rows[0].session_token);
}

const openContexts = new Set<BrowserContext>();

/** A browser context signed in as `email` (closed automatically after the test). */
export async function signedIn(browser: Browser, email: string, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ timezoneId: "America/New_York", locale: "en-US", ...opts });
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3002";
  await context.addCookies([{ name: "ty_session", value: await sessionFor(email), url: baseURL }]);
  const page = await context.newPage();
  trackRequests(page);
  openContexts.add(context);
  return { context, page };
}

/** Calls the API as `email` (for setup steps a spec isn't about). */
export async function api(email: string, method: string, pathname: string, body?: unknown) {
  const token = await sessionFor(email);
  const r = await fetch(API + pathname, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status}: ${text.slice(0, 300)}`);
  return json as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Posts an open request as `ownerEmail` through the API. Returns its id. */
export async function postRequest(
  ownerEmail: string,
  fields: Partial<{ title: string; category: string; description: string; mode: string; publicArea: string; exactAddress: string; startsAt: string; volunteersNeeded: number; requiredSkills: string; durationMinutes: number }>,
  as: "requester" | "org" = "requester",
  /** Any other request fields (orgSlug, requiresGuardianConsent, targetValue…). */
  extra: Record<string, unknown> = {}
): Promise<string> {
  const startsAt = fields.startsAt ?? new Date(Date.now() + 5 * 86400_000).toISOString();
  const created = await api(ownerEmail, "POST", "/v1/requests", {
    as,
    title: fields.title ?? uniq("E2E request"),
    category: fields.category ?? "errands",
    description: fields.description ?? "Created by the end-to-end suite. Safe to ignore.",
    volunteersNeeded: fields.volunteersNeeded ?? 1,
    urgency: "normal",
    scheduleType: "one_time",
    timezone: "America/New_York",
    startsAt,
    durationMinutes: fields.durationMinutes ?? 60,
    mode: fields.mode ?? "in-person",
    publicArea: fields.publicArea ?? "Astoria, Queens, NY",
    exactAddress: fields.exactAddress ?? "31-10 Ditmars Blvd, Apt 2",
    requiredSkills: fields.requiredSkills ?? "",
    ...extra
  });
  await api(ownerEmail, "POST", `/v1/requests/${created.id}/transition`, { event: "publish" });
  return String(created.id);
}

/** Runs a scheduled job now (reminders, hourly maintenance) as the seeded super admin. */
export const runJob = (name: "reminders.attendance" | "maintenance.hourly") => api(PERSONAS.admin, "POST", `/v1/admin/jobs/${name}/run`, {});

/** Fails on serious or critical axe violations (WCAG 2.1 A/AA). */
export async function expectAccessible(page: Page, label = page.url()) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id} (${v.impact}) on ${label}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/** The page never scrolls sideways (WCAG 1.4.10 reflow at 320–375 px). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `page is ${overflow}px wider than the viewport`).toBeLessThanOrEqual(1);
}

/**
 * Waits until the page has had no requests in flight for `quietMs`. After a client-side
 * navigation Next streams the new page in; a server action submitted while that is still
 * happening can lose its redirect (Next 15). People don't click that fast; tests do.
 */
const inflight = new WeakMap<Page, Set<unknown>>();
export function trackRequests(page: Page) {
  if (inflight.has(page)) return;
  const set = new Set<unknown>();
  inflight.set(page, set);
  page.on("request", (r) => {
    if (r.url().includes("/api/inbox/stream")) return; // long-lived SSE
    set.add(r);
  });
  const done = (r: unknown) => set.delete(r);
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}
export async function settle(page: Page, quietMs = 300, maxMs = 8000) {
  trackRequests(page);
  const set = inflight.get(page)!;
  const start = Date.now();
  let quietSince = set.size ? 0 : Date.now();
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(50);
    if (set.size) quietSince = 0;
    else if (!quietSince) quietSince = Date.now();
    else if (Date.now() - quietSince >= quietMs) return;
  }
}

/** Clicks a control that submits a server action, after the page has settled. */
export async function submit(page: Page, locator: ReturnType<Page["locator"]>) {
  await settle(page);
  await locator.click();
}

export const test = base.extend<{ closeContexts: void }>({
  page: async ({ page }, use) => {
    trackRequests(page);
    await use(page);
  },
  closeContexts: [
    async ({}, use) => {
      await use();
      for (const c of openContexts) await c.close().catch(() => undefined);
      openContexts.clear();
    },
    { auto: true }
  ]
});
export { expect };
