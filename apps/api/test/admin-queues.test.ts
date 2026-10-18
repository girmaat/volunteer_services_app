import { RELIABILITY_SQL } from "../src/modules/reviews/service";
import { describe, expect, it } from "vitest";
import { anon, as, createUser, EMAILS, pool, userId, ownerAct } from "./helpers";
import { defaultAction } from "../src/middleware/adminAudit";

const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const waitFor = async (fn: () => Promise<boolean>) => {
  for (let i = 0; i < 40; i++) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

async function sensitiveDraft(title: string) {
  await createUser({ email: "trusted.poster@volunteer-services-app.test", roles: ["requester"], trusted: true });
  const api = await as("trusted.poster@volunteer-services-app.test");
  const d = await api.post("/v1/requests", { title, description: "Needs help inside the home, reviewed first.", category: "home-access", mode: "in-person", publicArea: "Harlem, NY", scheduleType: "one_time", startsAt: soon(72) });
  const p = await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
  expect(p.body.review_status).toBe("pending_review");
  return String(d.body.id);
}

describe("sensitive-request review queue", () => {
  it("moderators approve or send back requests; every decision is audited", async () => {
    const a = await sensitiveDraft("Queue: fix a leaking tap");
    const b = await sensitiveDraft("Queue: hang a mirror");
    const mod = await as(EMAILS.moderator);
    const q = await mod.get("/v1/admin/review-queue?category=home-access");
    expect(q.status).toBe(200);
    expect(q.body.items.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([a, b]));
    expect(q.body.categories.find((c: { category: string }) => c.category === "home-access").n).toBeGreaterThanOrEqual(2);
    expect((await (await as(EMAILS.volunteer)).get("/v1/admin/review-queue")).status).toBe(403);

    const ok = await mod.post(`/v1/admin/requests/${a}/review`, { decision: "approve" });
    expect(ok.body.to).toBe("open");
    expect((await mod.post(`/v1/admin/requests/${b}/review`, { decision: "reject" })).status).toBe(422);
    const no = await mod.post(`/v1/admin/requests/${b}/review`, { decision: "reject", notes: "Please add the floor and access details." });
    expect(no.body.review_status).toBe("rejected");
    const owner = await (await as("trusted.poster@volunteer-services-app.test")).get(`/v1/requests/${b}`);
    expect(owner.body.review_notes).toContain("floor");
    // Trusted volunteers now see the approved one.
    expect((await (await as(EMAILS.volunteer)).get(`/v1/discovery/opportunities/${a}`)).status).toBe(200);
    expect(await waitFor(async () => (await pool.query("SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND action = 'request.approve'", [a])).rowCount === 1)).toBe(true);
    const audit = await (await as(EMAILS.admin)).get(`/v1/admin/audit-log?target=${b}`);
    expect(audit.body.items[0].action).toBe("request.reject");
    expect(audit.body.items[0].actor_role).toBe("moderator");
    expect((await mod.get("/v1/admin/audit-log")).status).toBe(403);
  });

  it("take-down hides a live request with a reason; restore brings it back", async () => {
    const api = await as(EMAILS.requester);
    const d = await api.post("/v1/requests", { title: "Queue: take me down", description: "A request that a moderator will remove.", category: "errands", mode: "remote", scheduleType: "flexible_window" });
    await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const mod = await as(EMAILS.moderator);
    expect((await mod.post(`/v1/admin/requests/${d.body.id}/take-down`, {})).status).toBe(422);
    const t = await mod.post(`/v1/admin/requests/${d.body.id}/take-down`, { reason: "Asks volunteers for money" });
    expect(t.body.to).toBe("canceled");
    expect((await anon().get(`/v1/discovery/opportunities/${d.body.id}`)).status).toBe(404);
    expect((await api.get(`/v1/requests/${d.body.id}`)).body.removed_reason).toBe("Asks volunteers for money");
    const r = await mod.post(`/v1/admin/requests/${d.body.id}/restore`);
    expect(r.body.to).toBe("open");
  });
});

describe("held messages, disputes, shadow-ban, metrics", () => {
  it("moderators release or reject held messages", async () => {
    await createUser({ email: "held.vol@volunteer-services-app.test", roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'held.vol@volunteer-services-app.test'");
    const api = await as(EMAILS.requester);
    const d = await api.post("/v1/requests", { title: "Queue: held message", description: "Request used to test held messages.", category: "errands", mode: "remote", scheduleType: "flexible_window" });
    await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const v = await as("held.vol@volunteer-services-app.test");
    await v.post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hello" });
    const conv = (await api.post("/v1/inbox/conversations", { requestId: d.body.id, volunteerUserId: await userId("held.vol@volunteer-services-app.test") })).body;
    await api.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "Thanks for applying!" });
    const m1 = await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "Can you send it by Venmo?" });
    const m2 = await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "Buy me a gift card please" });
    const mod = await as(EMAILS.moderator);
    const held = await mod.get("/v1/admin/messages/held");
    expect(held.body.items.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([m1.body.id, m2.body.id]));
    expect((await mod.post(`/v1/admin/messages/${m1.body.id}/decide`, { decision: "release" })).body.status).toBe("sent");
    expect((await mod.post(`/v1/admin/messages/${m2.body.id}/decide`, { decision: "reject" })).body.status).toBe("rejected");
    const t = await api.get(`/v1/inbox/conversations/${conv.id}`);
    expect(JSON.stringify(t.body)).toContain("Venmo");
    expect(JSON.stringify(t.body)).not.toContain("gift card");
    const mine = await v.get(`/v1/inbox/conversations/${conv.id}`);
    expect(mine.body.messages.find((m: { id: string }) => m.id === m2.body.id).status).toBe("rejected");
  });

  it("overturning a no-show dispute clears it from reliability", async () => {
    await createUser({ email: "disp.vol@volunteer-services-app.test", roles: ["volunteer"] });
    const api = await as(EMAILS.requester);
    const d = await api.post("/v1/requests", { title: "Queue: dispute", description: "Request used to test disputes.", category: "errands", mode: "remote", scheduleType: "one_time", startsAt: soon(30) });
    await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const ap = await (await as("disp.vol@volunteer-services-app.test")).post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    await ownerAct(api, ap.body.applicationId, "accept");
    await pool.query("UPDATE service_requests SET starts_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [d.body.id]);
    await api.post(`/v1/applications/${ap.body.applicationId}/no-show`);
    const disp = await (await as("disp.vol@volunteer-services-app.test")).post("/v1/disputes", { applicationId: ap.body.applicationId, kind: "no_show", reason: "I was there; the door was locked and nobody answered." });
    const mod = await as(EMAILS.moderator);
    expect((await mod.get("/v1/admin/disputes")).body.items.some((x: { id: string }) => x.id === disp.body.id)).toBe(true);
    expect((await mod.post(`/v1/admin/disputes/${disp.body.id}/decide`, { status: "overturned" })).status).toBe(400);
    const dec = await mod.post(`/v1/admin/disputes/${disp.body.id}/decide`, { status: "overturned", notes: "Photo shows the volunteer at the door on time." });
    expect(dec.body.status).toBe("overturned");
    expect((await mod.post(`/v1/admin/disputes/${disp.body.id}/decide`, { status: "upheld", notes: "again" })).status).toBe(409);
    const rel = await { body: (await pool.query(`SELECT ${RELIABILITY_SQL("$1")} AS r`, [await userId("disp.vol@volunteer-services-app.test")])).rows[0].r };
    expect(rel.body.no_shows).toBe(0);
  });

  it("shadow-ban is admin-only and hides the user's requests from others", async () => {
    const uid = await createUser({ email: "shadow.req@volunteer-services-app.test", roles: ["requester"] });
    const api = await as("shadow.req@volunteer-services-app.test");
    const d = await api.post("/v1/requests", { title: "Queue: shadow listing", description: "Should vanish for everyone else.", category: "errands", mode: "remote", scheduleType: "flexible_window" });
    await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    expect((await (await as(EMAILS.moderator)).post(`/v1/admin/users/${uid}/shadow-ban`, { on: true })).status).toBe(403);
    expect((await (await as(EMAILS.admin)).post(`/v1/admin/users/${uid}/shadow-ban`, { on: true, reason: "spam" })).body.shadow_banned).toBe(true);
    expect((await anon().get(`/v1/discovery/opportunities/${d.body.id}`)).status).toBe(404);
    expect((await api.get(`/v1/requests/${d.body.id}`)).status).toBe(200);
  });

  it("admins set background checks and manage categories; metrics load", async () => {
    const uid = await createUser({ email: "bgc.vol@volunteer-services-app.test", roles: ["volunteer"] });
    const admin = await as(EMAILS.admin);
    expect((await admin.post(`/v1/admin/users/${uid}/background-check`, { status: "cleared" })).body.background_check_status).toBe("cleared");
    const c = await admin.patch("/v1/admin/categories/children", { enabled: false });
    expect(c.body.enabled).toBe(false);
    expect((await anon().get("/v1/public/categories")).body.categories.some((x: { slug: string }) => x.slug === "children")).toBe(false);
    await admin.patch("/v1/admin/categories/children", { enabled: true });
    const m = await (await as(EMAILS.moderator)).get("/v1/admin/metrics");
    expect(m.status).toBe(200);
    expect(m.body.weekly).toHaveLength(12);
    expect(m.body).toHaveProperty("fill_rate_30d");
    expect(m.body.posted_30d).toBeGreaterThan(0);
  });
});

describe("admin: run a scheduled job now", () => {
  it("super admins can run the reminder job; moderators can't; the run is audited", async () => {
    const admin = await as(EMAILS.admin);
    const ok = await admin.post("/v1/admin/jobs/reminders.attendance/run", {});
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.job).toBe("reminders.attendance");
    expect((await admin.post("/v1/admin/jobs/drop.tables/run", {})).status).toBe(404);
    expect((await (await as(EMAILS.moderator)).post("/v1/admin/jobs/maintenance.hourly/run", {})).status).toBe(403);
    expect(await waitFor(async () => ((await pool.query("SELECT 1 FROM admin_audit_log WHERE action = 'job.run' AND target_id = 'reminders.attendance'")).rowCount ?? 0) > 0)).toBe(true);
  });

  it("names audit actions readably by default", () => {
    expect(defaultAction("POST", "/v1/admin/users/:id/strike")).toBe("users.strike");
    expect(defaultAction("POST", "/v1/admin/users/:id/ban")).toBe("users.ban");
    expect(defaultAction("PATCH", "/v1/admin/categories/:slug")).toBe("categories.update");
    expect(defaultAction("DELETE", "/v1/admin/categories/:slug")).toBe("categories.delete");
    expect(defaultAction("POST", "/v1/admin/categories")).toBe("categories.create");
  });
});
