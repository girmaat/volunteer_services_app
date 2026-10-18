/**
 * Security audit fixes (2026-10-12): each finding with the attack that used to work and now fails,
 * plus the legitimate path that must keep working.
 */
import { describe, expect, it } from "vitest";
import { anon, as, birthDateForAge, createUser, EMAILS, PASSWORD, pool, userId } from "./helpers";
import { makeOrg, orgRequest, publish, staffed, uniq } from "./pilot-helpers";
import { currentStep, hotp } from "../src/lib/totp";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

describe("joining an organization needs an admin's approval (critical #1)", () => {
  it("a stranger with a matching Gmail domain only gets a request; the admin approves or declines", async () => {
    const o = await makeOrg();
    await pool.query("UPDATE organizations SET contact_email = 'harborteam@gmail.com' WHERE slug = $1", [o.slug]);
    const s = await staffed(o);
    const stranger = `${uniq("stranger").toLowerCase()}@gmail.com`;
    await createUser({ email: stranger, roles: ["volunteer"] });
    const t = await as(stranger);
    const j = await t.post("/v1/orgs/join", { orgSlug: o.slug, adultConfirmed: true });
    expect(j.status).toBe(202);
    expect(j.body.status).toBe("requested");
    // No access while waiting.
    expect((await t.post("/v1/me/context", { context: `org:${o.slug}` })).status).toBe(403);
    expect((await t.get(`/v1/requests/${s.id}/applicants`)).status).toBe(404);
    // One request at a time.
    const other = await makeOrg();
    expect((await t.post("/v1/orgs/join", { orgSlug: other.slug, adultConfirmed: true })).status).toBe(409);
    // Admins are told; a manager can't decide.
    const admin = await as(o.admin);
    const req = (await admin.get("/v1/org/members")).body.members.find((m: { email: string }) => m.email === stranger);
    expect(req.status).toBe("requested");
    expect((await (await as(o.manager)).post(`/v1/org/members/requests/${req.member_id}/approve`, {})).status).toBe(403);
    expect((await admin.post(`/v1/org/members/requests/${req.member_id}/approve`, {})).body.status).toBe("active");
    expect((await t.get(`/v1/requests/${s.id}/applicants`)).status).toBe(200);
  });

  it("a declined request leaves no membership", async () => {
    const o = await makeOrg();
    const v = `${uniq("asker")}@volunteer-services-app.test`;
    await createUser({ email: v, roles: ["volunteer"] });
    await (await as(v)).post("/v1/orgs/join", { orgSlug: o.slug, adultConfirmed: true });
    const admin = await as(o.admin);
    const req = (await admin.get("/v1/org/members")).body.members.find((m: { email: string }) => m.email === v);
    expect((await admin.post(`/v1/org/members/requests/${req.member_id}/decline`, {})).body.status).toBe("declined");
    expect((await pool.query("SELECT 1 FROM organization_members WHERE org_slug = $1 AND user_id = $2", [o.slug, await userId(v)])).rowCount).toBe(0);
  });
});

describe("renaming an organization's address keeps everything (critical #2)", () => {
  it("documents, hours, attendance, settings and the hours queue survive a rename", async () => {
    const o = await makeOrg({ policy: "owner_all" });
    const s = await staffed(o);
    const a = await as(o.admin);
    expect((await a.post(`/v1/org/applications/${s.appId}/attendance/check-in`, {})).status).toBe(201);
    expect((await a.post(`/v1/org/applications/${s.appId}/attendance/check-out`, {})).status).toBeLessThan(300);
    await pool.query(`INSERT INTO org_documents (org_slug, doc_type, title, file_name, mime_type, bytes) VALUES ($1,'waiver','W','w.pdf','application/pdf','x')`, [o.slug]);
    const count = async (slug: string) => ({
      docs: (await pool.query("SELECT COUNT(*)::int n FROM org_documents WHERE org_slug=$1", [slug])).rows[0].n,
      hours: (await pool.query("SELECT COUNT(*)::int n FROM contributions WHERE org_slug=$1", [slug])).rows[0].n,
      attendance: (await pool.query("SELECT COUNT(*)::int n FROM org_attendance_logs WHERE org_slug=$1", [slug])).rows[0].n,
      requests: (await pool.query("SELECT COUNT(*)::int n FROM service_requests WHERE requester_org_slug=$1", [slug])).rows[0].n,
      members: (await pool.query("SELECT COUNT(*)::int n FROM organization_members WHERE org_slug=$1", [slug])).rows[0].n
    });
    const before = await count(o.slug);
    const queue = (await a.get("/v1/contributions/review?as=org&status=waiting")).body.items.length;
    const next = uniq("renamed").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const r = await a.post(`/v1/orgs/${o.slug}/slug`, { slug: next });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const slug = r.body.org.slug;
    expect(await count(slug)).toEqual(before);
    expect(await count(o.slug)).toEqual({ docs: 0, hours: 0, attendance: 0, requests: 0, members: 0 });
    expect((await pool.query("SELECT publication_policy FROM organizations WHERE slug=$1", [slug])).rows[0].publication_policy).toBe("owner_all");
    // The admin's session follows the new address.
    expect((await a.get("/v1/contributions/review?as=org&status=waiting")).body.items.length).toBe(queue);
  });
});

describe("account pre-hijacking (high #3)", () => {
  it("the owner who verifies gets their own password; the earlier sign-up's password stops working", async () => {
    const email = `${uniq("owner")}@example.com`;
    await anon().post("/v1/auth/signup").send({ email, password: "Attacker-pass-1", birthDate: "1990-01-01" });
    const v = await anon().post("/v1/auth/signup").send({ email, password: "Owner-pass-1", birthDate: "1990-01-01" });
    const token = new URL(v.body.dev_verify_url).searchParams.get("token");
    // Opening the link (a link scanner) doesn't use it up.
    expect((await anon().get(`/v1/auth/verify-email?token=${token}`)).body.status).toBe("valid");
    expect((await anon().post("/v1/auth/verify-email").send({ token })).status).toBe(200);
    expect((await anon().post("/v1/auth/login").send({ email, password: "Attacker-pass-1" })).status).toBe(401);
    expect((await anon().post("/v1/auth/login").send({ email, password: "Owner-pass-1" })).status).toBe(200);
    expect((await anon().post("/v1/auth/verify-email").send({ token })).status).toBe(400);
  });

  it("signing up with an email that already has an account reveals nothing", async () => {
    const r = await anon().post("/v1/auth/signup").send({ email: EMAILS.volunteer, password: "Whatever-pass-1", birthDate: "1990-01-01" });
    expect(r.status).toBe(202);
    expect(r.body.dev_verify_url).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/already/i);
  });

  it("accounts never verified are removed after 7 days", async () => {
    const email = `${uniq("stale")}@example.com`;
    await anon().post("/v1/auth/signup").send({ email, password: "Stale-pass-1", birthDate: "1990-01-01" });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '8 days' WHERE email = $1", [email]);
    const { purgeUnverifiedAccounts } = await import("../src/jobs/maintenance");
    expect(await purgeUnverifiedAccounts()).toBeGreaterThanOrEqual(1);
    expect((await pool.query("SELECT 1 FROM users WHERE email = $1", [email])).rowCount).toBe(0);
  });
});

describe("bans (high #4, medium #8)", () => {
  it("a ban ends sessions, blocks sign-in and org tools; a ban without an end date holds", async () => {
    const o = await makeOrg();
    const target = await userId(o.manager);
    const t = await (await anon().post("/v1/auth/login").send({ email: o.manager, password: PASSWORD })).body.sessionToken;
    expect((await anon().get("/v1/org/roster").set(bearer(t))).status).toBe(200);
    const admin = await as(EMAILS.admin);
    expect((await admin.post(`/v1/admin/users/${target}/ban`, { reason: "probe" })).status).toBe(200);
    expect((await anon().get("/v1/org/roster").set(bearer(t))).status).toBe(401);
    const login = await anon().post("/v1/auth/login").send({ email: o.manager, password: PASSWORD });
    expect(login.status).toBe(403);
    // Even a session that slipped through can't use org tools.
    const slipped = (await pool.query("WITH t AS (SELECT gen_random_uuid()::text AS raw) INSERT INTO sessions (user_id, session_token, expires_at) SELECT $1, session_key(t.raw), NOW() + INTERVAL '1 hour' FROM t RETURNING (SELECT raw FROM t) AS tok", [target])).rows[0].tok;
    expect((await anon().get("/v1/org/roster").set(bearer(slipped))).status).toBe(403);
    expect((await admin.post(`/v1/admin/users/${target}/ban`, { until: new Date(Date.now() - 1000).toISOString() })).status).toBe(400);
  });

  it("only a super admin can ban platform staff", async () => {
    const plain = `${uniq("plainadmin")}@volunteer-services-app.test`;
    await createUser({ email: plain, roles: ["volunteer"] });
    await pool.query("INSERT INTO platform_admins (user_id, role) VALUES ($1, 'admin')", [await userId(plain)]);
    const other = `${uniq("otheradmin")}@volunteer-services-app.test`;
    await createUser({ email: other, roles: ["volunteer"] });
    await pool.query("INSERT INTO platform_admins (user_id, role) VALUES ($1, 'admin')", [await userId(other)]);
    const p = await as(plain);
    expect((await p.post(`/v1/admin/users/${await userId(EMAILS.admin)}/ban`, { reason: "x" })).status).toBe(403);
    expect((await p.post(`/v1/admin/users/${await userId(other)}/strike`, { reason: "x" })).status).toBe(403);
    expect((await p.post(`/v1/admin/users/${await userId(other)}/shadow-ban`, { on: true })).status).toBe(403);
  });
});

describe("minors' profiles and public hours (high #5, medium #11)", () => {
  it("a 16-year-old's profile isn't public; they still see their own", async () => {
    const teen = `${uniq("teenprofile")}@volunteer-services-app.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    const id = await userId(teen);
    expect((await anon().get(`/v1/public/volunteers/${id}`)).status).toBe(404);
    expect((await (await as(EMAILS.volunteer)).get(`/v1/public/volunteers/${id}`)).status).toBe(404);
    expect((await (await as(teen)).get(`/v1/public/volunteers/${id}`)).status).toBe(200);
  });

  it("public hours are approved hours, never self-reported ones", async () => {
    const v = `${uniq("hours")}@volunteer-services-app.test`;
    await createUser({ email: v, roles: ["volunteer"] });
    await pool.query("INSERT INTO contributions (volunteer_user_id, source, reported_hours, status, verification_method) VALUES ($1, 'outside', 999, 'self_reported', 'self_reported')", [await userId(v)]);
    const r = await anon().get(`/v1/public/volunteers/${await userId(v)}`);
    expect(JSON.stringify(r.body)).not.toContain("999");
  });
});

describe("team admin rules (medium #7)", () => {
  it("the only admin can remove members but can't demote or remove themselves", async () => {
    const o = await makeOrg();
    const a = await as(o.admin);
    expect((await a.patch(`/v1/org/members/${await userId(o.admin)}`, { role: "member" })).status).toBe(409);
    expect((await a.del(`/v1/org/members/${await userId(o.admin)}`)).status).toBe(409);
    expect((await a.del(`/v1/org/members/${await userId(o.member)}`)).status).toBe(200);
    expect((await a.patch(`/v1/org/members/00000000-0000-0000-0000-000000000000`, { role: "admin" })).status).toBe(404);
    // With a second admin, the first can step down.
    await a.patch(`/v1/org/members/${await userId(o.manager)}`, { role: "admin" });
    expect((await a.patch(`/v1/org/members/${await userId(o.admin)}`, { role: "manager" })).status).toBe(200);
  });
});

describe("abuse limits (medium #9, low)", () => {
  it("guardian consent emails are limited", async () => {
    const teen = `${uniq("teenlimit")}@volunteer-services-app.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    const o = await makeOrg();
    const s = await staffed(o, { requiresGuardianConsent: true }, teen);
    const t = await as(teen);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await t.post(`/v1/volunteer/applications/${s.appId}/guardian`, { guardianName: "Pat Parent", guardianEmail: `p${i}@example.org`, relationship: "parent" })).status);
    expect(codes).toEqual([201, 201, 201, 429]);
  });

  it("two-step codes: ten wrong codes across sign-ins pause the account for 15 minutes", async () => {
    const email = `${uniq("mfalock")}@volunteer-services-app.test`;
    await createUser({ email, roles: ["volunteer"] });
    const t = (await anon().post("/v1/auth/login").send({ email, password: PASSWORD })).body.sessionToken;
    const setup = await anon().post("/v1/me/mfa/setup").set(bearer(t)).send({ password: PASSWORD });
    await anon().post("/v1/me/mfa/enable").set(bearer(t)).send({ code: hotp(setup.body.secret, currentStep()) });
    for (let i = 0; i < 2; i++) {
      const c = (await anon().post("/v1/auth/login").send({ email, password: PASSWORD })).body.mfa_token;
      for (let k = 0; k < 5; k++) await anon().post("/v1/auth/mfa").send({ mfaToken: c, code: "000000" });
    }
    const third = await anon().post("/v1/auth/login").send({ email, password: PASSWORD });
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe("mfa_locked");
  });

  it("a reset link can't be used twice, even at the same moment", async () => {
    const email = `${uniq("reset")}@volunteer-services-app.test`;
    await createUser({ email, roles: ["volunteer"] });
    const f = await anon().post("/v1/auth/forgot-password").send({ email });
    const token = new URL(f.body.dev_reset_url).searchParams.get("token");
    const [a, b] = await Promise.all([
      anon().post("/v1/auth/reset-password").send({ token, password: "First-new-pass-1" }),
      anon().post("/v1/auth/reset-password").send({ token, password: "Second-new-pass-1" })
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });
});

describe("storage and uploads (low)", () => {
  it("sessions are stored hashed", async () => {
    const r = await anon().post("/v1/auth/login").send({ email: EMAILS.volunteer, password: PASSWORD });
    const tok = String(r.body.sessionToken);
    expect((await pool.query("SELECT 1 FROM sessions WHERE session_token::text = $1", [tok])).rowCount).toBe(0);
    expect((await pool.query("SELECT 1 FROM sessions WHERE session_token = session_key($1)", [tok])).rowCount).toBe(1);
  });

  it("forms must really be PDF/JPEG/PNG; logos are uploaded, never linked", async () => {
    const o = await makeOrg();
    const token = (await anon().post("/v1/auth/login").send({ email: o.admin, password: PASSWORD })).body.sessionToken;
    const fake = await anon().post("/v1/org/documents").set(bearer(token)).field("doc_type", "waiver").field("title", "Fake").attach("file", Buffer.from("<html><script>alert(1)</script>"), { filename: "w.pdf", contentType: "application/pdf" });
    expect(fake.status).toBe(400);
    const admin = await as(o.admin);
    expect((await admin.patch(`/v1/orgs/${o.slug}`, { logo_url: "https://tracker.example/pixel.png" })).status).toBe(400);
    const up = await anon().post(`/v1/orgs/${o.slug}/logo`).set(bearer(token)).attach("file", PNG, "logo.png");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.logo_url).toMatch(/^\/media\/[0-9a-f-]{36}$/);
    const img = await anon().get(`/v1/public/media/${up.body.logo_url.split("/").pop()}`);
    expect(img.headers["content-type"]).toBe("image/png");
    expect((await anon().post(`/v1/orgs/${o.slug}/logo`).set(bearer(token)).attach("file", Buffer.from("GIF89a...."), "x.gif")).status).toBe(400);
    const v = await as(EMAILS.volunteer);
    expect((await v.post("/v1/onboarding/profile", { avatarUrl: "https://tracker.example/me.png" })).status).toBe(400);
  });

  it("incident reports only name volunteers who applied to that request", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug);
    await publish(o.admin, id);
    const r = await (await as(o.admin)).post("/v1/org/incidents", { request_id: id, volunteer_user_id: await userId(EMAILS.volunteer), title: "Late", description: "Arrived late again." });
    expect(r.status).toBe(404);
  });
});
