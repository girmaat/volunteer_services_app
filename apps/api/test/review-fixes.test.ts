/**
 * Fixes from the 2026-10-11 app review: each rule with the allowed path and the refusal (TEST-04).
 */
import { describe, expect, it } from "vitest";
import { anon, as, birthDateForAge, createUser, EMAILS, pool, userId } from "./helpers";
import { FIELDS, makeOrg, orgRequest, publish, soon, staffed, uniq } from "./pilot-helpers";

async function approvedRecord() {
  const o = await makeOrg();
  const s = await staffed(o);
  const admin = await as(o.admin);
  await admin.post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "complete" });
  const cid = String((await pool.query("SELECT id FROM contributions WHERE application_id = $1", [s.appId])).rows[0].id);
  await admin.post(`/v1/contributions/${cid}/decide`, { action: "approve" });
  const v = await as(s.volunteer);
  const rec = await v.post("/v1/volunteer/records", { contributionIds: [cid], nameMode: "legal", expiresInDays: 30, confirmed: true });
  expect(rec.status, JSON.stringify(rec.body)).toBe(201);
  return { o, s, cid, token: String(rec.body.token) };
}

describe("account deletion ends shared records", () => {
  it("a deleted volunteer's record stops verifying and no longer shows their name", async () => {
    const { s, token } = await approvedRecord();
    const name = s.volunteer.split("@")[0];
    expect((await anon().get(`/v1/public/records/${token}`)).body.state).toBe("valid");
    const del = await (await as(s.volunteer)).post("/v1/me/delete", { password: "Test-Password-123!", confirm: "DELETE" });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    const pub = await anon().get(`/v1/public/records/${token}`);
    expect(pub.body.state).toBe("revoked");
    expect(JSON.stringify(pub.body)).not.toContain(name);
  });
});

describe("organization team members are adults", () => {
  it("a 16-year-old can't start, join or accept an invite to an organization", async () => {
    const teen = `${uniq("teen-org")}@thankyou.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    const t = await as(teen);
    const create = await t.post("/v1/orgs/create", { org: { name: uniq("Teen org"), summary: "We run a weekly park cleanup.", location: "Queens, NY" }, admin: { adultConfirmed: true } });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe("adult_required");
    const o = await makeOrg();
    expect((await t.post("/v1/orgs/join", { orgSlug: o.slug, adultConfirmed: true })).status).toBe(403);
    const invToken = uniq("invite-token");
    await pool.query(
      `INSERT INTO organization_members (org_slug, role, status, invited_email, invite_token_hash, invite_expires_at)
       VALUES ($1, 'member', 'invited', $2, encode(sha256($3::bytea), 'hex'), NOW() + INTERVAL '7 days')`,
      [o.slug, teen, invToken]
    );
    const acc = await t.post("/v1/org/invites/accept", { token: invToken, adultConfirmed: true });
    expect(acc.status, JSON.stringify(acc.body)).toBe(403);
  });

  it("someone with no birth date confirms they're 18+, and an adult goes straight through", async () => {
    const none = `${uniq("nodob")}@thankyou.test`;
    await createUser({ email: none, roles: ["volunteer"], birthDate: null });
    const n = await as(none);
    const body = { org: { name: uniq("New org"), summary: "We deliver groceries to neighbors.", location: "Queens, NY" } };
    const refused = await n.post("/v1/orgs/create", body);
    expect(refused.status).toBe(403);
    expect(refused.body.message).toMatch(/18 or older/);
    expect((await n.post("/v1/orgs/create", { ...body, admin: { adultConfirmed: true } })).status).toBe(201);
    const row = await pool.query("SELECT adult_attested_at FROM users WHERE id = $1", [await userId(none)]);
    expect(row.rows[0].adult_attested_at).not.toBeNull();

    const adult = `${uniq("adult")}@thankyou.test`;
    await createUser({ email: adult, roles: ["volunteer"] });
    expect((await (await as(adult)).post("/v1/orgs/create", { org: { ...body.org, name: uniq("Adult org") } })).status).toBe(201);
  });
});

describe("one accept rule for every accept path", () => {
  it("the org team PATCH and the owner view both refuse past the goal and accept part of an offer", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { targetValue: 10, targetUnit: "hours", volunteersNeeded: 5, title: uniq("Goal") });
    expect((await publish(o.admin, id)).status).toBe(200);
    const apps: string[] = [];
    for (let i = 0; i < 3; i++) {
      const v = `${uniq("goal-v")}@thankyou.test`;
      await createUser({ email: v, roles: ["volunteer"] });
      const ap = await (await as(v)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "Count me in", offeredAmount: 6 });
      expect(ap.status, JSON.stringify(ap.body)).toBe(201);
      apps.push(String(ap.body.applicationId));
    }
    const admin = await as(o.admin);
    expect((await admin.patch(`/v1/org/applications/${apps[0]}`, { status: "accepted" })).status).toBe(200);
    // 4 hours left: the team PATCH can't take a full 6-hour offer.
    const over = await admin.patch(`/v1/org/applications/${apps[1]}`, { status: "accepted", accepted_amount: 6 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("over_target");
    const part = await admin.patch(`/v1/org/applications/${apps[1]}`, { status: "accepted" });
    expect(part.status).toBe(200);
    expect(Number(part.body.accepted_amount)).toBe(4);
    const met = await admin.post(`/v1/requests/${id}/applicants/${apps[2]}`, { action: "accept" });
    expect(met.status).toBe(409);
    expect(met.body.error.code).toBe("target_met");
  });
});

describe("minors in staff lists and manual attendance", () => {
  it("hides a minor's email in the roster and attendance list, and manual attendance waits for prerequisites", async () => {
    const teen = `${uniq("teen-roster")}@thankyou.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    const o = await makeOrg();
    const s = await staffed(o, { requiresGuardianConsent: true }, teen);
    const admin = await as(o.admin);
    const start = new Date(Date.now() - 3 * 3600_000).toISOString();
    const end = new Date(Date.now() - 1 * 3600_000).toISOString();
    const blocked = await admin.post("/v1/org/attendance/manual", { application_id: s.appId, check_in_at: start, check_out_at: end });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toMatch(/^prerequisites_/);
    // Clear the guardian consent directly, then it records.
    await pool.query(
      `INSERT INTO guardian_consents (volunteer_user_id, request_id, application_id, guardian_name, guardian_email, relationship, token_hash, status, signed_name, responded_at, expires_at)
       VALUES ($1, $2, $3, 'Pat Parent', 'pat@example.org', 'parent', $4, 'granted', 'Pat Parent', NOW(), NOW() + INTERVAL '30 days')`,
      [await userId(teen), s.id, s.appId, uniq("hash")]
    );
    const ok = await admin.post("/v1/org/attendance/manual", { application_id: s.appId, check_in_at: start, check_out_at: end });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const roster = await admin.get("/v1/org/roster");
    expect(JSON.stringify(roster.body)).not.toContain(teen);
    const att = await admin.get("/v1/org/attendance");
    expect(JSON.stringify(att.body)).not.toContain(teen);
  });

  it("manual attendance is only for accepted volunteers and needs a sensible time range", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug);
    await publish(o.admin, id);
    const v = `${uniq("pending-v")}@thankyou.test`;
    await createUser({ email: v, roles: ["volunteer"] });
    const ap = await (await as(v)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    const admin = await as(o.admin);
    const r = await admin.post("/v1/org/attendance/manual", { application_id: ap.body.applicationId, check_in_at: soon(-1), check_out_at: soon(-1) });
    expect(r.status).toBe(409);
  });
});

describe("listings a minor can't take part in", () => {
  it("leave individual and too-old requests out of a teen's discovery, but keep the detail page", async () => {
    const teen = `${uniq("teen-disc")}@thankyou.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    const tag = uniq("Zebra");
    const own = await (await as(EMAILS.requester)).post("/v1/requests", { title: `${tag} individual`, ...FIELDS, startsAt: soon(6) });
    await (await as(EMAILS.requester)).post(`/v1/requests/${own.body.id}/transition`, { event: "publish" });
    const o = await makeOrg();
    const old = await orgRequest(o.admin, o.slug, { title: `${tag} adults`, minAge: 21 });
    await publish(o.admin, old);
    const ok = await orgRequest(o.admin, o.slug, { title: `${tag} teens welcome` });
    await publish(o.admin, ok);

    const t = await as(teen);
    const list = await t.get(`/v1/discovery/opportunities?tab=all&q=${encodeURIComponent(tag)}&limit=50`);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(ok);
    expect(ids).not.toContain(old);
    expect(ids).not.toContain(own.body.id);
    expect((await t.get(`/v1/discovery/opportunities/${old}`)).status).toBe(200);
    // An adult sees all three.
    const adult = await (await as(EMAILS.volunteer)).get(`/v1/discovery/opportunities?tab=all&q=${encodeURIComponent(tag)}&limit=50`);
    expect(adult.body.items.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining([ok, old, own.body.id]));
  });

  it("an organization asked for more information drops out of listings until it's approved again", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { title: uniq("Paused org listing") });
    await publish(o.admin, id);
    const v = await as(EMAILS.volunteer);
    expect((await v.get(`/v1/discovery/opportunities/${id}`)).status).toBe(200);
    await pool.query("UPDATE organizations SET verification_status = 'needs_info' WHERE slug = $1", [o.slug]);
    expect((await v.get(`/v1/discovery/opportunities/${id}`)).status).toBe(404);
    await pool.query("UPDATE organizations SET verification_status = 'approved' WHERE slug = $1", [o.slug]);
    expect((await v.get(`/v1/discovery/opportunities/${id}`)).status).toBe(200);
  });
});

describe("waiver and training flags point at real forms", () => {
  it("an organization can't publish 'waiver required' until a waiver is attached", async () => {
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { requiresWaiver: true });
    const admin = await as(o.admin);
    expect((await admin.get(`/v1/requests/${id}`)).body.publish_problems.join(" ")).toMatch(/waiver/i);
    const r = await publish(o.admin, id);
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/waiver/i);
    const doc = await pool.query(
      `INSERT INTO org_documents (org_slug, doc_type, title, file_name, mime_type, bytes) VALUES ($1, 'waiver', 'Liability waiver', 'w.txt', 'text/plain', 'x') RETURNING id`,
      [o.slug]
    );
    await pool.query("INSERT INTO org_document_assignments (org_document_id, request_id) VALUES ($1, $2)", [doc.rows[0].id, id]);
    expect((await publish(o.admin, id)).status).toBe(200);
  });

  it("an individual can't require a waiver or training", async () => {
    const api = await as(EMAILS.requester);
    const d = await api.post("/v1/requests", { title: uniq("Individual waiver"), ...FIELDS, startsAt: soon(4), requiresTraining: true });
    expect(d.status).toBe(201);
    const r = await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    expect(r.status).toBe(422);
    expect(r.body.message).toMatch(/Only organizations/);
  });
});

describe("data export covers the record of service", () => {
  it("includes contributions, decisions, shared records, consents and signatures", async () => {
    const { s } = await approvedRecord();
    const ex = await (await as(s.volunteer)).get("/v1/me/export");
    expect(ex.status).toBe(200);
    const data = JSON.parse(ex.text);
    expect(data.contributions).toHaveLength(1);
    expect(data.contributions[0]).toMatchObject({ status: "approved", approved_hours: 2 });
    expect(data.contribution_decisions.map((d: { action: string }) => d.action)).toEqual(expect.arrayContaining(["created", "approved"]));
    expect(data.service_records).toHaveLength(1);
    expect(data).toHaveProperty("guardian_consents");
    expect(data).toHaveProperty("signed_documents");
  });
});

describe("material edits to a live request", () => {
  it("logs the change, tells accepted volunteers, and asks them to confirm again; small edits don't", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    const admin = await as(o.admin);
    const v = await as(s.volunteer);
    expect((await v.post(`/v1/volunteer/applications/${s.appId}/confirm-attendance`, {})).status).toBe(200);
    // Urgency isn't material.
    await admin.patch(`/v1/requests/${s.id}`, { urgency: "high" });
    let ev = (await admin.get(`/v1/requests/${s.id}`)).body.events.map((e: { event: string }) => e.event);
    expect(ev).not.toContain("material_edit");
    const r = await admin.patch(`/v1/requests/${s.id}`, { publicArea: "Long Island City, Queens, NY", equipmentNotes: "Bring work gloves" });
    expect(r.status).toBe(200);
    const view = await admin.get(`/v1/requests/${s.id}`);
    const edit = view.body.events.find((e: { event: string }) => e.event === "material_edit");
    expect(edit.reason).toMatch(/area/);
    expect(edit.reason).toMatch(/what to bring/);
    const c = await pool.query("SELECT volunteer_confirmed_at FROM request_commitments WHERE request_id = $1", [s.id]);
    expect(c.rows[0].volunteer_confirmed_at).toBeNull();
    const n = await pool.query("SELECT title, body FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = $1) ORDER BY created_at DESC LIMIT 1", [s.volunteer]);
    expect(n.rows[0].title).toMatch(/changed/);
    expect(n.rows[0].body).toMatch(/confirm you're still coming/);
    ev = view.body.events.map((e: { event: string }) => e.event);
    expect(ev.filter((e: string) => e === "material_edit")).toHaveLength(1);
  });

  it("a repeating shift that moves sends an updated invite with the repeat rule", async () => {
    const { icsEvent } = await import("../src/lib/ics");
    const body = icsEvent({ uid: "x@t", start: new Date("2026-11-07T14:00:00Z"), end: new Date("2026-11-07T16:00:00Z"), title: "Weekend shift", rrule: "FREQ=WEEKLY;BYDAY=SA,SU", timezone: "America/New_York" });
    expect(body).toContain("RRULE:FREQ=WEEKLY;BYDAY=SA,SU");
    expect(body).toContain("DTSTART;TZID=America/New_York:20261107T090000");
    // A rule with anything odd in it is dropped rather than written into the calendar file.
    expect(icsEvent({ uid: "y@t", start: new Date(), end: new Date(), title: "t", rrule: "FREQ=DAILY\r\nX:1" })).not.toContain("RRULE");

    const o = await makeOrg();
    const s = await staffed(o, { scheduleType: "recurring", recurrenceRule: "FREQ=WEEKLY;BYDAY=SA,SU" });
    expect((await (await as(o.admin)).post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "confirm" })).status).toBe(200);
    const before = await pool.query("SELECT ics_sequence FROM request_commitments WHERE request_id = $1", [s.id]);
    const r = await (await as(o.admin)).patch(`/v1/requests/${s.id}`, { recurrenceRule: "FREQ=WEEKLY;BYDAY=SA" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = await pool.query("SELECT ics_sequence FROM request_commitments WHERE request_id = $1", [s.id]);
    expect(before.rowCount).toBe(1);
    expect(Number(after.rows[0].ics_sequence)).toBe(Number(before.rows[0].ics_sequence) + 1);
  });
});

describe("lists say how much they hold, and reports stay with admins and managers", () => {
  it("the hours review pages through entries with a total", async () => {
    const o = await makeOrg();
    for (let i = 0; i < 3; i++) {
      const s = await staffed(o);
      await (await as(o.admin)).post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "complete" });
    }
    const admin = await as(o.admin);
    const p1 = await admin.get("/v1/contributions/review?as=org&status=waiting&limit=2");
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.page).toMatchObject({ total: 3, offset: 0, next_offset: 2 });
    const p2 = await admin.get("/v1/contributions/review?as=org&status=waiting&limit=2&offset=2");
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.page.next_offset).toBeNull();
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
  });

  it("members can't open reports, the roster or attendance; managers can, and totals cover every row", async () => {
    const o = await makeOrg();
    await staffed(o);
    const member = await as(o.member);
    for (const path of ["/v1/org/reports/impact", "/v1/org/reports/volunteer-hours", "/v1/org/roster", "/v1/org/attendance"]) {
      expect((await member.get(path)).status, path).toBe(403);
    }
    const mgr = await as(o.manager);
    const imp = await mgr.get("/v1/org/reports/impact");
    expect(imp.status).toBe(200);
    expect(imp.body.per_request_total).toBe(imp.body.per_request.length);
    const vh = await mgr.get("/v1/org/reports/volunteer-hours?all=1");
    expect(vh.status).toBe(200);
    expect(vh.body).toHaveProperty("volunteers_total");
  });
});

describe("saved searches and alerts (VOL-03)", () => {
  it("saves a search, alerts once about requests that went live since, and respects alerts off", async () => {
    const vol = `${uniq("alerts")}@thankyou.test`;
    await createUser({ email: vol, roles: ["volunteer"] });
    const v = await as(vol);
    const tag = uniq("Quokka");
    expect((await v.post("/v1/volunteer/saved-searches", { name: "", query: `q=${tag}` })).status).toBe(400);
    const s = await v.post("/v1/volunteer/saved-searches", { name: "Quokkas", query: `?q=${tag}&tab=all&cursor=abc&limit=5` });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect(s.body.query).toBe(`q=${tag}&tab=all`);
    expect((await v.post("/v1/volunteer/saved-searches", { name: "Again", query: `q=${tag}&tab=all` })).status).toBe(409);
    // Someone else can't see or change it.
    expect((await (await as(EMAILS.volunteer)).patch(`/v1/volunteer/saved-searches/${s.body.id}`, { alerts: false })).status).toBe(404);

    // A matching request goes live after the search was saved.
    await pool.query("UPDATE saved_searches SET last_checked_at = NOW() - INTERVAL '2 days' WHERE id = $1", [s.body.id]);
    const o = await makeOrg();
    const id = await orgRequest(o.admin, o.slug, { title: `${tag} feeding at the shelter` });
    await publish(o.admin, id);
    const { runSavedSearchAlerts } = await import("../src/modules/alerts/routes");
    const before = await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'alerts'", [await userId(vol)]);
    await runSavedSearchAlerts();
    const after = await pool.query("SELECT title, data FROM notifications WHERE user_id = $1 AND type = 'alerts' ORDER BY created_at DESC", [await userId(vol)]);
    expect(after.rows.length).toBe(before.rows[0].n + 1);
    expect(after.rows[0].title).toMatch(/1 new for “Quokkas”/);
    expect(after.rows[0].data.requestIds).toEqual([id]);
    // Not due again until tomorrow, and nothing new anyway.
    await runSavedSearchAlerts();
    expect((await pool.query("SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND type = 'alerts'", [await userId(vol)])).rows[0].n).toBe(after.rows.length);

    expect((await v.patch(`/v1/volunteer/saved-searches/${s.body.id}`, { alerts: false })).body.alerts).toBe(false);
    expect((await v.get("/v1/volunteer/saved-searches")).body.saved_searches).toHaveLength(1);
    expect((await v.del(`/v1/volunteer/saved-searches/${s.body.id}`)).status).toBe(200);
  });
});

describe("retired volunteer self-log", () => {
  it("the old free-form hours endpoints are gone; hours go through contributions", async () => {
    const v = await as(EMAILS.volunteer);
    expect((await v.post("/v1/volunteer/history/impact", { impact_date: "2026-10-01", hours: 3 })).status).toBe(404);
    expect((await v.get("/v1/volunteer/history/hours")).status).toBe(404);
    expect((await v.get("/v1/volunteer/history/summary")).status).toBe(404);
    expect((await v.get("/v1/volunteer/impact")).status).toBe(200);
  });
});

describe("applicants list carries review state", () => {
  it("includes the owner's review state for completed volunteers, and not for team members", async () => {
    const o = await makeOrg();
    const s = await staffed(o);
    await (await as(o.admin)).post(`/v1/requests/${s.id}/applicants/${s.appId}`, { action: "complete" });
    const list = await (await as(o.admin)).get(`/v1/requests/${s.id}/applicants`);
    const a = list.body.applicants.find((x: { id: string }) => x.id === s.appId);
    expect(a.review).toMatchObject({ side: "owner", can_review: true, mine: null });
    const member = await (await as(o.member)).get(`/v1/requests/${s.id}/applicants`);
    if (member.status === 200) expect(member.body.applicants.find((x: { id: string }) => x.id === s.appId).review).toBeNull();
  });
});
