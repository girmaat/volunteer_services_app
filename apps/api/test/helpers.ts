import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { pool } from "../src/lib/db";

export const PASSWORD = "Test-Password-123!";
export const EMAILS = {
  admin: "admin@thankyou.test",
  orgAdmin: "org.admin@thankyou.test",
  orgMember: "org.member@thankyou.test",
  volunteer: "volunteer.local@thankyou.test",
  remoteVolunteer: "volunteer.remote@thankyou.test",
  requester: "requester@thankyou.test",
  dual: "dual.role@thankyou.test",
  moderator: "moderator@thankyou.test"
} as const;

let app: Express | null = null;
export function getApp() {
  app ??= createApp();
  return app;
}

const tokens = new Map<string, string>();
export async function tokenFor(email: string): Promise<string> {
  const cached = tokens.get(email);
  if (cached) return cached;
  const res = await request(getApp()).post("/v1/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(email, res.body.sessionToken);
  return res.body.sessionToken;
}

/** Authenticated supertest helpers. */
export async function as(email: string) {
  const t = await tokenFor(email);
  const a = getApp();
  return {
    get: (p: string) => request(a).get(p).set("authorization", `Bearer ${t}`),
    post: (p: string, body?: object) => request(a).post(p).set("authorization", `Bearer ${t}`).send(body ?? {}),
    put: (p: string, body?: object) => request(a).put(p).set("authorization", `Bearer ${t}`).send(body ?? {}),
    patch: (p: string, body?: object) => request(a).patch(p).set("authorization", `Bearer ${t}`).send(body ?? {}),
    del: (p: string) => request(a).delete(p).set("authorization", `Bearer ${t}`)
  };
}

export const anon = () => request(getApp());

export async function userId(email: string): Promise<string> {
  const r = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  return String(r.rows[0].id);
}

export { pool };

let hashCache: string | null = null;
/** Creates a fully onboarded user with the given member roles (and optional org membership). */
export async function createUser(opts: { email: string; roles?: ("volunteer" | "requester")[]; org?: { slug: string; role: "admin" | "manager" | "member" }; trusted?: boolean }) {
  const bcrypt = (await import("bcryptjs")).default;
  hashCache ??= await bcrypt.hash(PASSWORD, 4);
  const roles = opts.roles ?? [];
  const legacy = roles[0] ?? (opts.org ? "org_admin" : null);
  const u = await pool.query(
    `INSERT INTO users (email, password_hash, email_verified_at, role, account_type, profile_completed, availability_completed, onboarding_completed, verification_status)
     VALUES ($1, $2, NOW(), $3, $4, TRUE, TRUE, TRUE, $5)
     ON CONFLICT (email) DO UPDATE SET updated_at = NOW() RETURNING id`,
    [opts.email, hashCache, legacy, legacy === "requester" ? "individual_requester" : legacy === "org_admin" ? "org_team_member" : "volunteer", opts.trusted ? "approved" : "not_required"]
  );
  const id = String(u.rows[0].id);
  await pool.query("INSERT INTO user_profiles (user_id, full_name, display_name, public_location) VALUES ($1, $2, $2, 'Jersey City, NJ') ON CONFLICT DO NOTHING", [id, opts.email.split("@")[0]]);
  for (const r of roles) await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, r]);
  if (opts.org)
    await pool.query("INSERT INTO organization_members (org_slug, user_id, role, status, joined_at) VALUES ($1, $2, $3, 'active', NOW())", [opts.org.slug, id, opts.org.role]);
  return id;
}
