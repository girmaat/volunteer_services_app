/**
 * Pilot requirements (requirements_document Draft 2): each feature has the allowed path and the
 * refusals that matter (TEST-04). Every test builds its own organization so nothing shared changes.
 */
import { describe, expect, it } from "vitest";
import { anon, as, birthDateForAge, createUser, EMAILS, pool, tokenFor, userId } from "./helpers";
import { expireOffers } from "../src/modules/requests/offers";

const soon = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();
let seq = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++seq}`;

/** A fresh organization with an admin (owner), a manager (coordinator) and a member. */
async function makeOrg(opts: { verified?: boolean; policy?: string } = {}) {
  const slug = uniq("pilot-org");
  await pool.query(
    `INSERT INTO organizations (slug, name, summary, location, onboarding_completed, verification_status, verified_at, publication_policy)
     VALUES ($1, $2, 'A test organization for pilot rules.', 'Queens, NY', TRUE, $3, $4, $5)`,
    [slug, `Org ${slug}`, opts.verified === false ? "required" : "approved", opts.verified === false ? null : new Date(), opts.policy ?? "owner_first_and_high_risk"]
  );
  const admin = `${slug}.admin@thankyou.test`;
  const manager = `${slug}.manager@thankyou.test`;
  const member = `${slug}.member@thankyou.test`;
  await createUser({ email: admin, org: { slug, role: "admin" } });
  await createUser({ email: manager, org: { slug, role: "manager" } });
  await createUser({ email: member, org: { slug, role: "member" } });
  return { slug, admin, manager, member };
}

const FIELDS = {
  description: "Sort donated coats by size and hang them on racks for the giveaway.",
  category: "events",
  volunteersNeeded: 3,
  scheduleType: "one_time",
  timezone: "America/New_York",
  durationMinutes: 120,
  mode: "in-person",
  publicArea: "Astoria, Queens, NY"
};

async function orgRequest(email: string, slug: string, extra: Record<string, unknown> = {}) {
  const r = await (await as(email)).post("/v1/requests", { as: "org", orgSlug: slug, title: uniq("Pilot shift"), startsAt: soon(5), ...FIELDS, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return String(r.body.id);
}

async function publish(email: string, id: string) {
  return (await as(email)).post(`/v1/requests/${id}/transition`, { event: "publish" });
}

/** A published org request with one accepted volunteer. */
async function staffed(o: Awaited<ReturnType<typeof makeOrg>>, extra: Record<string, unknown> = {}, volunteer?: string) {
  const id = await orgRequest(o.admin, o.slug, extra);
  expect((await publish(o.admin, id)).status).toBe(200);
  const v = volunteer ?? uniq("vol") + "@thankyou.test";
  if (!volunteer) await createUser({ email: v, roles: ["volunteer"] });
  const ap = await (await as(v)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "Happy to help", ...(extra.targetValue ? { offeredAmount: 5 } : {}) });
  expect(ap.status, JSON.stringify(ap.body)).toBe(201);
  const acc = await (await as(o.admin)).post(`/v1/requests/${id}/applicants/${ap.body.applicationId}`, { action: "accept" });
  expect(acc.status, JSON.stringify(acc.body)).toBe(200);
  return { id, volunteer: v, appId: String(ap.body.applicationId) };
}

describe("verified-only publishing and owner approval (ORG-02/05, GOV-01/02, CASE-01)", () => {
  it("an unverified organization saves drafts but can't publish", async () => {
    const o = await makeOrg({ verified: false });
    const id = await orgRequest(o.admin, o.slug);
    const r = await publish(o.admin, id);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("org_not_verified");
    // The old endpoint follows the same rule.
    const legacy = await (await as(o.admin)).post("/v1/org/requests", { title: "Legacy", description: "Legacy publish attempt here." });
    expect(legacy.status).toBe(403);
  });

  it("platform staff ask for more information, suspend and reinstate, always with a reason", async () => {
    const o = await makeOrg({ verified: false });
    const admin = await as(EMAILS.admin);
    expect((await admin.post(`/v1/admin/org-verification/${o.slug}/needs-info`, {})).status).toBe(422);
    expect((await admin.post(`/v1/admin/org-verification/${o.slug}/needs-info`, { notes: "Upload your IRS letter." })).body.status).toBe("needs_info");
    const id = await orgRequest(o.admin, o.slug);
    expect((await publish(o.admin, id)).body.message).toMatch(/more information/);
    // Resubmitting is the appeal route.
    expect((await (await as(o.admin)).post(`/v1/orgs/${o.slug}/verification/submit`, { submission_notes: "Uploaded." })).status).toBe(200);
    expect((await admin.post(`/v1/admin/org-verification/${o.slug}/approve`, {})).body.status).toBe("approved");
    expect((await publish(o.admin, id)).status).toBe(200);
    // Suspension hides the listing and stops publishing; non-admins can't do it.
    expect((await (await as(EMAILS.volunteer)).post(`/v1/admin/org-verification/${o.slug}/suspend`, { notes: "x" })).status).toBe(403);
    expect((await admin.post(`/v1/admin/org-verification/${o.slug}/suspend`, { notes: "Reports of unsafe sites." })).body.status).toBe("suspended");
    expect((await anon().get(`/v1/public/opportunities/${id}`)).status).toBe(404);
    const id2 = await orgRequest(o.admin, o.slug);
    expect((await publish(o.admin, id2)).body.message).toMatch(/suspended/);
    expect((await admin.post(`/v1/admin/org-verification/${o.slug}/approve`, {})).status).toBe(409);
    expect((await admin.post(`/v1/admin/org-verification/${o.slug}/reinstate`, { notes: "Resolved." })).body.status).toBe("approved");
    expect((await anon().get(`/v1/public/opportunities/${id}`)).status).toBe(200);
  });

  it("a coordinator's first request waits for the owner; rejection keeps it private with notes", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.manager, o.slug);
    const sub = await publish(o.manager, id);
    expect(sub.status).toBe(202);
    expect(sub.body.owner_approval).toBe("pending");
    expect((await anon().get(`/v1/public/opportunities/${id}`)).status).toBe(404);
    // Coordinators and members can't approve; the owner must give a reason to send it back.
    expect((await (await as(o.manager)).post(`/v1/requests/${id}/owner-approval`, { decision: "approve" })).status).toBe(403);
    expect((await (await as(o.member)).post(`/v1/requests/${id}/owner-approval`, { decision: "approve" })).status).toBe(404);
    expect((await (await as(o.admin)).post(`/v1/requests/${id}/owner-approval`, { decision: "reject" })).status).toBe(422);
    const rej = await (await as(o.admin)).post(`/v1/requests/${id}/owner-approval`, { decision: "reject", notes: "Add the onsite contact." });
    expect(rej.body).toMatchObject({ owner_approval: "rejected", status: "draft" });
    const view = await (await as(o.manager)).get(`/v1/requests/${id}`);
    expect(view.body).toMatchObject({ status: "draft", owner_approval: "rejected", owner_approval_notes: "Add the onsite contact." });
    // Edit and resubmit; the owner approves and it publishes, recording who and when.
    await (await as(o.manager)).patch(`/v1/requests/${id}`, { accessibilityNotes: "Onsite contact: Sam at the door." });
    expect((await publish(o.manager, id)).body.owner_approval).toBe("pending");
    const ok = await (await as(o.admin)).post(`/v1/requests/${id}/owner-approval`, { decision: "approve" });
    expect(ok.body).toMatchObject({ to: "open", owner_approval: "approved" });
    const row = (await pool.query("SELECT owner_approved_by_user_id, owner_approved_at FROM service_requests WHERE id = $1", [id])).rows[0];
    expect(String(row.owner_approved_by_user_id)).toBe(await userId(o.admin));
    expect(row.owner_approved_at).toBeTruthy();
    // After the first one, ordinary requests publish directly; high-risk ones still need the owner.
    const plain = await orgRequest(o.manager, o.slug);
    expect((await publish(o.manager, plain)).status).toBe(200);
    const risky = await orgRequest(o.manager, o.slug, { requiresGuardianConsent: true });
    expect((await publish(o.manager, risky)).status).toBe(202);
  });

  it("the owner can delegate publishing or require approval for everything", async () => {
    const o = await makeOrg({ policy: "delegated" });
    expect((await publish(o.manager, await orgRequest(o.manager, o.slug))).status).toBe(200);
    expect((await (await as(o.manager)).patch(`/v1/orgs/${o.slug}`, { publication_policy: "owner_all" })).status).toBe(403);
    expect((await (await as(o.admin)).patch(`/v1/orgs/${o.slug}`, { publication_policy: "owner_all" })).status).toBe(200);
    expect((await publish(o.manager, await orgRequest(o.manager, o.slug))).status).toBe(202);
  });
});

describe("hours approval in an organization (CON-01/05/06, ID-05, DATA-03, GOV-04)", () => {
  it("staff check-out creates pending hours; managers approve, members can't", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    const admin = await as(o.admin);
    expect((await admin.post(`/v1/org/applications/${s.appId}/attendance/check-in`, {})).status).toBe(201);
    const out = await admin.post(`/v1/org/applications/${s.appId}/attendance/check-out`, {});
    expect(out.body.contribution_id).toBeTruthy();
    const cid = out.body.contribution_id;
    // Retrying check-out doesn't create a second contribution.
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM contributions WHERE application_id = $1", [s.appId])).rows[0].n).toBe(1);
    expect((await (await as(o.member)).post(`/v1/contributions/${cid}/decide`, { action: "approve" })).status).toBe(404);
    const q = await (await as(o.manager)).get("/v1/contributions/review?as=org");
    expect(q.body.items.find((x: { id: string }) => x.id === cid)).toMatchObject({ status: "pending", verification_method: "staff_check_in", can_decide: true });
    expect((await (await as(o.manager)).post(`/v1/contributions/${cid}/decide`, { action: "approve" })).body.status).toBe("approved");
    // A correction after approval needs a reason and is recorded as a correction.
    expect((await admin.post(`/v1/contributions/${cid}/decide`, { action: "adjust", hours: 0.5 })).status).toBe(422);
    const fix = await admin.post(`/v1/contributions/${cid}/decide`, { action: "adjust", hours: 0.5, reason: "Clock-out was late" });
    expect(fix.body.status).toBe("adjusted");
    const hist = (await admin.get(`/v1/contributions/${cid}`)).body.history.map((h: { action: string }) => h.action);
    expect(hist).toEqual(["created", "approved", "corrected"]);
  });

  it("staff can't approve their own hours or those of someone they declared a conflict with", async () => {
    const o = await makeOrg();
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'volunteer') ON CONFLICT DO NOTHING", [await userId(o.manager)]);
    const s = await staffed(o, {}, o.manager);
    await (await as(o.admin)).post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "complete" });
    const cid = (await pool.query("SELECT id FROM contributions WHERE application_id = $1", [s.appId])).rows[0].id;
    const self = await (await as(o.manager)).post(`/v1/contributions/${cid}/decide`, { action: "approve" });
    expect(self.body.error.code).toBe("self_approval");
    // The admin is the volunteer's parent: they declare it and are blocked too.
    const admin = await as(o.admin);
    expect((await admin.post(`/v1/contributions/${cid}/conflict`, { relationship: "my son" })).body.other_reviewers).toBe(0);
    const blocked = await admin.post(`/v1/contributions/${cid}/decide`, { action: "approve" });
    expect(blocked.body.error.code).toBe("conflict");
    const q = await admin.get("/v1/contributions/review?as=org");
    expect(q.body.items.find((x: { id: string }) => x.id === cid)).toMatchObject({ can_decide: false, why_not: "You declared a conflict with this volunteer" });
    // Attempts are recorded for the audit and exception queue.
    const actions = (await pool.query("SELECT action FROM contribution_decisions WHERE contribution_id = $1 ORDER BY created_at", [cid])).rows.map((r) => r.action);
    expect(actions).toEqual(["created", "blocked_self", "conflict_declared", "blocked_conflict"]);
    expect((await pool.query("SELECT status FROM contributions WHERE id = $1", [cid])).rows[0].status).toBe("pending");
  });

  it("overlapping credited time is blocked and flagged; bulk approval skips exceptions (CASE-06)", async () => {
    const o = await makeOrg();
    const s1 = await staffed(o);
    const s2 = await staffed(o, {}, s1.volunteer);
    const vid = await userId(s1.volunteer);
    const t = (h: number) => new Date(Date.UTC(2026, 8, 1, h)).toISOString();
    const add = async (s: { id: string; appId: string }, from: number, to: number) => {
      const log = await pool.query(
        "INSERT INTO org_attendance_logs (org_slug, request_id, request_application_id, volunteer_user_id, check_in_at, check_out_at, hours) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
        [o.slug, s.id, s.appId, vid, t(from), t(to), to - from]
      );
      const { contributionFromAttendance } = await import("../src/modules/contributions/service");
      return String(await contributionFromAttendance(String(log.rows[0].id), "manual_attendance", null));
    };
    const a = await add(s1, 14, 16);
    const b = await add(s2, 15, 17);
    const admin = await as(o.admin);
    // Bulk approval approves the clean entry and leaves the flagged one for a person to look at.
    const bulk = await admin.post("/v1/contributions/bulk-approve", { ids: [a, b] });
    expect(bulk.body.approved).toEqual([a]);
    expect(bulk.body.skipped).toEqual([{ id: b, reason: "Overlaps other hours for this volunteer" }]);
    const clash = await admin.post(`/v1/contributions/${b}/decide`, { action: "approve" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("overlap");
    // A documented correction is allowed, and the original submission stays in the history.
    expect((await admin.post(`/v1/contributions/${b}/decide`, { action: "reject", reason: "Overlaps the 2–4 PM shift; resubmit 4–5 PM" })).body.status).toBe("rejected");
    const hist = (await admin.get(`/v1/contributions/${b}`)).body.history.map((h: { action: string }) => h.action);
    expect(hist).toEqual(["created", "blocked_overlap", "rejected"]);
  });

  it("unverified or suspended organizations can't approve hours", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    await (await as(o.admin)).post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "complete" });
    const cid = (await pool.query("SELECT id FROM contributions WHERE application_id = $1", [s.appId])).rows[0].id;
    await pool.query("UPDATE organizations SET suspended_at = NOW(), verification_status = 'suspended' WHERE slug = $1", [o.slug]);
    expect((await (await as(o.admin)).post(`/v1/contributions/${cid}/decide`, { action: "approve" })).body.error.code).toBe("org_not_verified");
  });
});

describe("shareable service records (REC-02/03, ID-07, TEST-02, CASE-07)", () => {
  it("previews, shares, verifies, and shows corrected, replaced, revoked and expired states without private data", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    const admin = await as(o.admin);
    await admin.post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "complete" });
    const cid = String((await pool.query("SELECT id FROM contributions WHERE application_id = $1", [s.appId])).rows[0].id);
    const v = await as(s.volunteer);
    // Only approved entries can go on a record.
    expect((await v.post("/v1/volunteer/records/preview", { contributionIds: [cid] })).status).toBe(422);
    await admin.post(`/v1/contributions/${cid}/decide`, { action: "approve" });
    const pre = await v.post("/v1/volunteer/records/preview", { contributionIds: [cid], nameMode: "legal", expiresInDays: 30 });
    expect(pre.body.snapshot.volunteer_name).toBe(s.volunteer.split("@")[0]);
    expect(pre.body.snapshot.entries[0]).toMatchObject({ hours: 2, approved_by: "Organization administrator", organization_verified: true });
    expect(pre.body.snapshot.statement).toMatch(/did not check an identity document/);
    // Sharing needs the explicit confirmation after the preview.
    expect((await v.post("/v1/volunteer/records", { contributionIds: [cid] })).status).toBe(400);
    const rec = await v.post("/v1/volunteer/records", { contributionIds: [cid], nameMode: "legal", expiresInDays: 30, confirmed: true });
    expect(rec.status).toBe(201);
    const pub = await anon().get(`/v1/public/records/${rec.body.token}`);
    expect(pub.body).toMatchObject({ state: "valid", issuer: "ThankYou" });
    expect(pub.body.entries).toHaveLength(1);
    expect(JSON.stringify(pub.body)).not.toContain("@");
    // Someone else can't revoke it.
    expect((await (await as(EMAILS.volunteer)).post(`/v1/volunteer/records/${rec.body.id}/revoke`, {})).status).toBe(404);

    // The supervisor corrects the hours: the old link says so and shows no entries.
    await admin.post(`/v1/contributions/${cid}/decide`, { action: "adjust", hours: 1.5, reason: "Left early" });
    const corrected = await anon().get(`/v1/public/records/${rec.body.token}`);
    expect(corrected.body.state).toBe("corrected");
    expect(corrected.body.entries).toBeUndefined();
    const re = await v.post(`/v1/volunteer/records/${rec.body.id}/reissue`, {});
    expect((await anon().get(`/v1/public/records/${rec.body.token}`)).body.state).toBe("replaced");
    const fresh = await anon().get(`/v1/public/records/${re.body.token}`);
    expect(fresh.body.entries[0]).toMatchObject({ hours: 1.5, corrected: true });
    // Revoked and expired records show their state and nothing else; the approval history stays.
    await v.post(`/v1/volunteer/records/${re.body.id}/revoke`, {});
    expect(await anon().get(`/v1/public/records/${re.body.token}`).then((r) => r.body)).toMatchObject({ state: "revoked" });
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM contribution_decisions WHERE contribution_id = $1", [cid])).rows[0].n).toBe(3);
    const third = await v.post("/v1/volunteer/records", { contributionIds: [cid], expiresInDays: 7, confirmed: true });
    await pool.query("UPDATE service_records SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [third.body.id]);
    const exp = await anon().get(`/v1/public/records/${third.body.token}`);
    expect(exp.body.state).toBe("expired");
    expect(exp.body.volunteer_name).toBeUndefined();
    expect((await anon().get("/v1/public/records/not-a-real-token-at-all-xx")).status).toBe(404);
  });
});

describe("age gate and minors (SAFE-01/04, ID-01, FORM-03, CASE-02)", () => {
  it("sign-up needs a real birth date and age 16+", async () => {
    const base = { email: `${uniq("young")}@example.org`, password: "A-good-password-1" };
    expect((await anon().post("/v1/auth/signup").send(base)).status).toBe(400);
    expect((await anon().post("/v1/auth/signup").send({ ...base, birthDate: "2030-02-31" })).status).toBe(400);
    const young = await anon().post("/v1/auth/signup").send({ ...base, birthDate: birthDateForAge(15) });
    expect(young.status).toBe(422);
    expect(young.body.error.code).toBe("too_young");
    expect((await anon().post("/v1/auth/signup").send({ ...base, birthDate: birthDateForAge(16) })).status).toBe(202);
    const p = await pool.query("SELECT p.birth_date FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE u.email = $1", [base.email]);
    expect(p.rows[0].birth_date).toBeTruthy();
  });

  it("minors work only with organizations, contact stays masked, and guardian consent gates check-in", async () => {
    const teen = `${uniq("teen")}@thankyou.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    // Individual requests are for adults.
    const own = await (await as(EMAILS.requester)).post("/v1/requests", {
      title: "Adult-only individual request",
      ...FIELDS,
      startsAt: soon(6)
    });
    await (await as(EMAILS.requester)).post(`/v1/requests/${own.body.id}/transition`, { event: "publish" });
    const no = await (await as(teen)).post(`/v1/volunteer/opportunities/${own.body.id}/apply`, { message: "hi" });
    expect(no.status).toBe(422);
    expect(no.body.problems.map((x: { code: string }) => x.code)).toContain("adult_only");

    const o = await makeOrg();
    const s = await staffed(o, { requiresGuardianConsent: true }, teen);
    // Contact details stay hidden even after acceptance.
    const list = await (await as(o.admin)).get(`/v1/requests/${s.id}/applicants`);
    const me = list.body.applicants.find((a: { id: string }) => a.id === s.appId);
    expect(me).toMatchObject({ email: null, phone: null, minor: true });
    expect(me.prerequisites.status).toBe("pending");
    // Check-in is blocked until a guardian consents.
    const blocked = await (await as(o.admin)).post(`/v1/org/applications/${s.appId}/attendance/check-in`, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("prerequisites_pending");
    const t = await as(teen);
    expect((await t.post(`/v1/volunteer/applications/${s.appId}/guardian`, { guardianName: "Me", guardianEmail: teen, relationship: "parent" })).status).toBe(422);
    process.env.DEV_EMAIL_LINKS = "true";
    const ask = await t.post(`/v1/volunteer/applications/${s.appId}/guardian`, { guardianName: "Pat Parent", guardianEmail: "pat.parent@example.org", relationship: "parent" });
    expect(ask.status, JSON.stringify(ask.body)).toBe(201);
    const token = String(ask.body.dev_consent_url).split("/").pop()!;
    const page = await anon().get(`/v1/public/guardian-consents/${token}`);
    expect(page.body).toMatchObject({ state: "pending", org_name: `Org ${o.slug}` });
    expect(JSON.stringify(page.body)).not.toContain(teen);
    expect((await anon().post(`/v1/public/guardian-consents/${token}`).send({ decision: "grant", signedName: "Pat Parent" })).status).toBe(400);
    const yes = await anon().post(`/v1/public/guardian-consents/${token}`).send({ decision: "grant", signedName: "Pat Parent", confirmGuardian: true });
    expect(yes.body.status).toBe("granted");
    expect((await anon().post(`/v1/public/guardian-consents/${token}`).send({ decision: "decline", signedName: "Pat Parent", confirmGuardian: true })).status).toBe(409);
    expect((await (await as(o.admin)).post(`/v1/org/applications/${s.appId}/attendance/check-in`, {})).status).toBe(201);
  });

  it("an adult-only opportunity is visible to a minor but they can't apply, and the rule is explained", async () => {
    const teen = `${uniq("teen")}@thankyou.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(17) });
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { minAge: 18 });
    await publish(o.admin, id);
    expect((await anon().get(`/v1/public/opportunities/${id}`)).status).toBe(200);
    const r = await (await as(teen)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    expect(r.body.problems[0]).toMatchObject({ code: "too_young", message: "This opportunity is for volunteers 18 and older." });
  });
});

describe("versioned waivers as prerequisites (FORM-01/02/04)", () => {
  const pdf = (v: string) => Buffer.from(`%PDF-1.4\n% waiver ${v}\n%%EOF\n`);

  it("a form required before applying, then a new version blocks check-in until re-signed", async () => {
    const o = await makeOrg();
    const token = await tokenFor(o.admin);
    const up = await anon().post("/v1/org/documents").set("authorization", `Bearer ${token}`).field("doc_type", "waiver").field("title", "Liability waiver").attach("file", pdf("1"), "waiver.pdf");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const docId = up.body.document.id;
    const id = await orgRequest(o.admin, o.slug);
    await publish(o.admin, id);
    expect((await (await as(o.admin)).post(`/v1/org/documents/${docId}/assign`, { request_id: id, required_before: "apply" })).status).toBe(200);

    const v = `${uniq("signer")}@thankyou.test`;
    await createUser({ email: v, roles: ["volunteer"] });
    const va = await as(v);
    const early = await va.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    expect(early.body.problems.map((x: { code: string }) => x.code)).toContain("sign_first");
    expect((await va.post(`/v1/volunteer/documents/${docId}/sign`, { request_id: id, signer_name: "Sam Signer" })).status).toBe(400);
    const signed = await va.post(`/v1/volunteer/documents/${docId}/sign`, { request_id: id, signer_name: "Sam Signer", agree: true });
    expect(signed.body.version).toBe(1);
    const ack = (await pool.query("SELECT document_version, sha256, signer_name, signature_method FROM volunteer_document_acks WHERE org_document_id = $1", [docId])).rows[0];
    expect(ack).toMatchObject({ document_version: 1, signer_name: "Sam Signer", signature_method: "typed_name" });
    expect(ack.sha256).toMatch(/^[0-9a-f]{64}$/);
    const ap = await va.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    expect(ap.status).toBe(201);
    await (await as(o.admin)).post(`/v1/requests/${id}/applicants/${ap.body.applicationId}`, { action: "accept" });

    // A new version that changes what people agree to blocks check-in for those who signed v1.
    const v2 = await anon()
      .post(`/v1/org/documents/${docId}/versions`)
      .set("authorization", `Bearer ${token}`)
      .field("change_note", "Added a photo release section")
      .attach("file", pdf("2"), "waiver-v2.pdf");
    expect(v2.body).toMatchObject({ version: 2, requires_resign: true, volunteers_to_resign: 1 });
    const pre = await va.get(`/v1/volunteer/requests/${id}/prerequisites`);
    expect(pre.body.status).toBe("blocked");
    expect(pre.body.items[0]).toMatchObject({ state: "stale", signed_version: 1, version: 2 });
    const blocked = await (await as(o.admin)).post(`/v1/org/applications/${ap.body.applicationId}/attendance/check-in`, {});
    expect(blocked.body.error.code).toBe("prerequisites_blocked");
    await va.post(`/v1/volunteer/documents/${docId}/sign`, { request_id: id, signer_name: "Sam Signer", agree: true });
    expect((await va.get(`/v1/volunteer/requests/${id}/prerequisites`)).body.status).toBe("cleared");
    // Both signatures are kept, each with its own version and hash.
    const all = (await pool.query("SELECT document_version, sha256 FROM volunteer_document_acks WHERE org_document_id = $1 ORDER BY document_version", [docId])).rows;
    expect(all.map((r) => r.document_version)).toEqual([1, 2]);
    expect(all[0].sha256).not.toBe(all[1].sha256);
    const versions = await (await as(o.admin)).get(`/v1/org/documents/${docId}/versions`);
    expect(versions.body.versions.map((x: { version: number }) => x.version)).toEqual([2, 1]);
  });
});

describe("targets, units and partial offers (REQ-01/05/06, scenario: 40-hour tutoring request)", () => {
  it("keeps target, committed, waiting and approved separate and accepts part of an offer", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { targetValue: 40, targetUnit: "hours", minContribution: 2, volunteersNeeded: 10, title: uniq("Tutoring") });
    await publish(o.admin, id);
    const vols = [1, 2, 3, 4].map((n) => `${uniq(`tutor${n}`)}@thankyou.test`);
    for (const v of vols) await createUser({ email: v, roles: ["volunteer"] });
    expect((await (await as(vols[0])).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" })).status).toBe(400);
    expect((await (await as(vols[0])).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi", offeredAmount: 1 })).status).toBe(422);
    const apps: string[] = [];
    for (const [i, v] of vols.entries()) apps.push((await (await as(v)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi", offeredAmount: [15, 15, 15, 5][i] })).body.applicationId);
    const admin = await as(o.admin);
    const go = (a: string, extra: Record<string, unknown> = {}) => admin.post(`/v1/requests/${id}/applicants/${a}`, { action: "accept", ...extra });
    expect((await go(apps[0])).status).toBe(200);
    expect((await go(apps[1])).status).toBe(200);
    // 10 left: accepting all 15 is refused; part of it is fine.
    expect((await go(apps[2], { acceptedAmount: 15 })).body.error.code).toBe("over_target");
    expect((await go(apps[2], { acceptedAmount: 10 })).status).toBe(200);
    const list = await admin.get(`/v1/requests/${id}/applicants`);
    expect(list.body.request).toMatchObject({ target: 40, unit: "hours", committed: 40, approved: 0, open_capacity: 0, committed_not_approved: 40 });
    expect((await admin.get(`/v1/requests/${id}`)).body.status).toBe("filled");
    // Commitments aren't delivered service: approving 27 hours moves "approved", nothing else.
    const vid = await userId(vols[0]);
    const { createContribution } = await import("../src/modules/contributions/service");
    const c = await createContribution({ volunteerUserId: vid, requestId: id, applicationId: apps[0], source: "volunteer_report", method: "volunteer_report", hours: 12, description: "Sessions", actorUserId: vid, actorRole: "volunteer" });
    await admin.post(`/v1/contributions/${c}/decide`, { action: "adjust", hours: 11, reason: "One session was canceled" });
    const after = (await admin.get(`/v1/requests/${id}/applicants`)).body.request;
    expect(after).toMatchObject({ committed: 40, approved: 11, committed_not_approved: 29 });
  });
});

describe("waitlist offers (REQ-07)", () => {
  it("a full org request offers the freed spot instead of placing someone", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { volunteersNeeded: 1 });
    await publish(o.admin, id);
    const a = `${uniq("wa")}@thankyou.test`;
    const b = `${uniq("wb")}@thankyou.test`;
    await createUser({ email: a, roles: ["volunteer"] });
    await createUser({ email: b, roles: ["volunteer"] });
    const appA = (await (await as(a)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" })).body.applicationId;
    const admin = await as(o.admin);
    await admin.post(`/v1/requests/${id}/applicants/${appA}`, { action: "accept" });
    const appB = (await (await as(b)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" })).body;
    expect(appB.status).toBe("waitlisted");
    await (await as(a)).post(`/v1/volunteer/applications/${appA}/cancel`, {});
    expect((await pool.query("SELECT status FROM request_applications WHERE id = $1", [appB.applicationId])).rows[0].status).toBe("offered");
    expect(await expireOffers()).toBe(0); // not expired yet
  });
});

describe("calendar updates and QR check-in (CAL-01/02, CON-04)", () => {
  it("moving a shift sends an updated invite with the same UID; canceling sends a cancellation", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    const admin = await as(o.admin);
    await admin.post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "confirm" });
    const cid = (await pool.query("SELECT id FROM request_commitments WHERE request_id = $1", [s.id])).rows[0].id;
    const v = await as(s.volunteer);
    const first = (await v.get(`/v1/volunteer/calendar/commitments/${cid}/ics`)).text;
    expect(first).toContain("SEQUENCE:0");
    await admin.patch(`/v1/requests/${s.id}`, { startsAt: soon(6) });
    const second = (await v.get(`/v1/volunteer/calendar/commitments/${cid}/ics`)).text;
    expect(second).toContain("SEQUENCE:1");
    expect(second).toContain(`UID:commitment-${cid}@thankyou`);
    expect(second).toContain("METHOD:REQUEST");
    const n = await pool.query("SELECT title FROM notifications WHERE user_id = $1 AND type = 'calendar'", [await userId(s.volunteer)]);
    expect(n.rows.map((r) => r.title).join()).toMatch(/New time/);
    expect((await pool.query("SELECT 1 FROM email_log WHERE user_id = $1 AND type = 'calendar'", [await userId(s.volunteer)])).rowCount).toBeGreaterThan(0);
    await admin.post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "cancel" });
    const third = (await v.get(`/v1/volunteer/calendar/commitments/${cid}/ics`)).text;
    expect(third).toContain("METHOD:CANCEL");
    expect(third).toContain("STATUS:CANCELLED");
    expect(third).toContain("SEQUENCE:2");
    // A minor's contact details never go into the invite.
    expect(third).not.toMatch(/@thankyou\.test/);
  });

  it("volunteers check themselves in and out with the on-site code, near the shift only", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    expect((await (await as(o.member)).post(`/v1/requests/${s.id}/checkin-code`, {})).status).toBe(404);
    const code = await (await as(o.admin)).post(`/v1/requests/${s.id}/checkin-code`, {});
    expect(code.body.url).toContain(`/check-in/${code.body.token}`);
    const v = await as(s.volunteer);
    const early = await v.post(`/v1/checkin/${code.body.token}`, { action: "in" });
    expect(early.body.error.code).toBe("outside_window");
    await pool.query("UPDATE service_requests SET starts_at = NOW() - INTERVAL '10 minutes', ends_at = NOW() + INTERVAL '2 hours' WHERE id = $1", [s.id]);
    const stranger = `${uniq("stranger")}@thankyou.test`;
    await createUser({ email: stranger, roles: ["volunteer"] });
    expect((await (await as(stranger)).post(`/v1/checkin/${code.body.token}`, { action: "in" })).body.error.code).toBe("not_assigned");
    expect((await v.post(`/v1/checkin/${code.body.token}`, { action: "in" })).status).toBe(201);
    expect((await v.post(`/v1/checkin/${code.body.token}`, { action: "in" })).status).toBe(409);
    const out = await v.post(`/v1/checkin/${code.body.token}`, { action: "out" });
    const c = await v.get(`/v1/contributions/${out.body.contribution_id}`);
    expect(c.body).toMatchObject({ status: "pending", verification_method: "qr_check_in" });
    // Rotating the code retires the old one.
    const rotated = await (await as(o.admin)).post(`/v1/requests/${s.id}/checkin-code`, { rotate: true });
    expect(rotated.body.token).not.toBe(code.body.token);
    expect((await v.get(`/v1/checkin/${code.body.token}`)).status).toBe(404);
  });
});

describe("organization reports on approved hours (OPS-02, OPS-05)", () => {
  it("separates approved, waiting and declined hours, keeps units apart, and measures approval delay", async () => {
    const o = await makeOrg();
    const admin = await as(o.admin);
    const { createContribution } = await import("../src/modules/contributions/service");
    const s = await staffed(o);
    const meals = await orgRequest(o.admin, o.slug, { targetValue: 100, targetUnit: "meals", title: uniq("Meals") });
    await publish(o.admin, meals);
    const teen = `${uniq("teen")}@thankyou.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(17) });
    const tApp = (await (await as(teen)).post(`/v1/volunteer/opportunities/${meals}/apply`, { message: "hi", offeredAmount: 30 })).body.applicationId;
    await admin.post(`/v1/requests/${meals}/applicants/${tApp}`, { action: "accept", acceptedAmount: 25 });
    const vid = await userId(s.volunteer);
    const tid = await userId(teen);
    const at = (iso: string, h: number) => ({ startedAt: new Date(iso), endedAt: new Date(new Date(iso).getTime() + h * 3_600_000) });
    const mk = (volunteer: string, app: string, req: string, t: { startedAt: Date; endedAt: Date }, units?: number) =>
      createContribution({ volunteerUserId: volunteer, requestId: req, applicationId: app, source: "volunteer_report", method: "volunteer_report", ...t, units: units ?? null, description: "x", actorUserId: volunteer, actorRole: "volunteer" });
    const a = await mk(vid, s.appId, s.id, at("2026-09-02T14:00:00Z", 3)); // approved as reported
    const b = await mk(vid, s.appId, s.id, at("2026-09-03T14:00:00Z", 2)); // adjusted to 1.5
    const c = await mk(vid, s.appId, s.id, at("2026-09-04T14:00:00Z", 4)); // declined
    await mk(vid, s.appId, s.id, at("2026-09-05T14:00:00Z", 1)); // waiting
    const m = await mk(tid, tApp, meals, at("2026-09-06T14:00:00Z", 2), 20); // 20 meals, approved
    await admin.post(`/v1/contributions/${a}/decide`, { action: "approve" });
    await admin.post(`/v1/contributions/${b}/decide`, { action: "adjust", hours: 1.5, reason: "Left early" });
    await admin.post(`/v1/contributions/${c}/decide`, { action: "reject", reason: "Not this shift" });
    await admin.post(`/v1/contributions/${m}/decide`, { action: "approve" });

    const r = await admin.get("/v1/org/reports/impact?from=2026-09-01&to=2026-09-30");
    expect(r.status).toBe(200);
    expect(r.body.hours).toMatchObject({ approved: 6.5, waiting: 1, declined: 4, approved_entries: 3, adjusted_entries: 1, volunteers: 2 });
    expect(r.body.units).toEqual([{ unit: "meals", approved: 20, waiting: 0 }]);
    expect(r.body.approval_delay.decided).toBe(4);
    expect(r.body.approval_delay.median_hours).not.toBeNull();
    const mealsRow = r.body.per_request.find((x: { request_id: string }) => x.request_id === meals);
    expect(mealsRow).toMatchObject({ target: 100, unit: "meals", promised: 25, approved_in_unit: 20, approved_hours: 2 });
    const shiftRow = r.body.per_request.find((x: { request_id: string }) => x.request_id === s.id);
    expect(shiftRow).toMatchObject({ approved_hours: 4.5, waiting_hours: 1, target: null });

    // `to` covers the whole day; earlier ranges leave the work out.
    expect((await admin.get("/v1/org/reports/impact?from=2026-09-02&to=2026-09-02")).body.hours.approved).toBe(3);
    expect((await admin.get("/v1/org/reports/impact?to=2026-08-31")).body.hours.approved).toBe(0);

    // Per volunteer: approved and waiting apart; a minor's email isn't in the report.
    const v = await admin.get("/v1/org/reports/volunteer-hours?from=2026-09-01&to=2026-09-30");
    expect(v.body).toMatchObject({ approved_hours: 6.5, waiting_hours: 1, total_hours: 6.5 });
    const adult = v.body.volunteers.find((x: { volunteer_user_id: string }) => x.volunteer_user_id === vid);
    expect(adult).toMatchObject({ approved_hours: 4.5, waiting_hours: 1, declined_hours: 4, approved_entries: 2 });
    expect(adult.volunteer_email).toBe(s.volunteer);
    const minor = v.body.volunteers.find((x: { volunteer_user_id: string }) => x.volunteer_user_id === tid);
    expect(minor).toMatchObject({ minor: true, volunteer_email: null, approved_hours: 2 });

    // Only this organization's people see it.
    expect((await (await as(EMAILS.volunteer)).get("/v1/org/reports/impact")).status).toBe(403);
  });
});
