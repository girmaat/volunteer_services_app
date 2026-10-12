import { describe, expect, it } from "vitest";
import { anon, as, createUser, EMAILS, PASSWORD, pool, userId } from "./helpers";

const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

describe("account self-service (U14)", () => {
  it("exports everything held about the user as JSON", async () => {
    const r = await (await as(EMAILS.requester)).get("/v1/me/export");
    expect(r.status).toBe(200);
    expect(r.headers["content-disposition"]).toContain("thankyou-data-");
    const data = JSON.parse(r.text);
    expect(data.account.email).toBe(EMAILS.requester);
    expect(Array.isArray(data.requests_posted)).toBe(true);
    expect(data).toHaveProperty("messages_sent");
    expect(JSON.stringify(data)).not.toContain("password_hash");
  });

  it("deletes an account after password confirmation and cancels open work", async () => {
    await createUser({ email: "leaving@thankyou.test", roles: ["requester", "volunteer"] });
    const api = await as("leaving@thankyou.test");
    const d = await api.post("/v1/requests", { title: "Leaving: help me", description: "This request should be canceled on deletion.", category: "errands", mode: "remote", scheduleType: "flexible_window" });
    await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    expect((await api.post("/v1/me/delete", { password: PASSWORD })).status).toBe(400);
    expect((await api.post("/v1/me/delete", { password: "wrong", confirm: "DELETE" })).status).toBe(403);
    const del = await api.post("/v1/me/delete", { password: PASSWORD, confirm: "DELETE" });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect((await api.get("/v1/me")).status).toBe(401);
    expect((await anon().post("/v1/auth/login").send({ email: "leaving@thankyou.test", password: PASSWORD })).status).not.toBe(200);
    const r = await pool.query("SELECT status, cancel_reason FROM service_requests WHERE id = $1", [d.body.id]);
    expect(r.rows[0].status).toBe("canceled");
    const p = await pool.query("SELECT display_name, full_name FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE u.email LIKE 'deleted+%' AND u.id = (SELECT requester_user_id FROM service_requests WHERE id = $1)", [d.body.id]);
    expect(p.rows[0]).toEqual({ display_name: "Deleted member", full_name: null });
  });

  it("refuses to delete the last admin of an organization", async () => {
    const api = await as(EMAILS.orgAdmin);
    const r = await api.post("/v1/me/delete", { password: PASSWORD, confirm: "DELETE" });
    expect(r.status).toBe(409);
  });
});

describe("attendance confirmation and impact export (U8, U10)", () => {
  it("accepted volunteers confirm attendance", async () => {
    await createUser({ email: "confirm.vol@thankyou.test", roles: ["volunteer"] });
    const owner = await as(EMAILS.requester);
    const d = await owner.post("/v1/requests", { title: "Confirm: shift", description: "Confirm attendance test request.", category: "errands", mode: "remote", scheduleType: "one_time", startsAt: soon(40) });
    await owner.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const v = await as("confirm.vol@thankyou.test");
    const ap = await v.post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    expect((await v.post(`/v1/volunteer/applications/${ap.body.applicationId}/confirm-attendance`)).status).toBe(409);
    await owner.post(`/v1/requester/applications/${ap.body.applicationId}/accept`);
    expect((await v.post(`/v1/volunteer/applications/${ap.body.applicationId}/confirm-attendance`)).body.confirmed).toBe(true);
    const c = await pool.query("SELECT volunteer_confirmed_at FROM request_commitments WHERE request_id = $1 AND volunteer_user_id = $2", [d.body.id, await userId("confirm.vol@thankyou.test")]);
    expect(c.rows[0].volunteer_confirmed_at).toBeTruthy();

    // The commitment downloads as a calendar file, for its volunteer only.
    const cid = (await pool.query("SELECT id FROM request_commitments WHERE request_id = $1", [d.body.id])).rows[0].id;
    const ics = await v.get(`/v1/volunteer/calendar/commitments/${cid}/ics`);
    expect(ics.status).toBe(200);
    expect(ics.headers["content-type"]).toContain("text/calendar");
    expect(ics.text).toMatch(/BEGIN:VCALENDAR[\s\S]*SUMMARY:Volunteering: Confirm: shift[\s\S]*END:VCALENDAR/);
    expect((await (await as(EMAILS.volunteer)).get(`/v1/volunteer/calendar/commitments/${cid}/ics`)).status).toBe(404);
  });

  it("completed work becomes pending hours; only the reviewer's approval counts (CON-05, REC-01, DATA-04)", async () => {
    await createUser({ email: "hours.vol@thankyou.test", roles: ["volunteer"] });
    const owner = await as(EMAILS.requester);
    const d = await owner.post("/v1/requests", { title: "Hours: shift", description: "Impact hours test request.", category: "errands", mode: "remote", scheduleType: "one_time", startsAt: soon(40), durationMinutes: 90 });
    await owner.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const v = await as("hours.vol@thankyou.test");
    const ap = await v.post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    await owner.post(`/v1/requests/${d.body.id}/applicants/${ap.body.applicationId}`, { action: "accept" });
    await owner.post(`/v1/requests/${d.body.id}/applicants/${ap.body.applicationId}`, { action: "complete" });

    // Marking complete sends the scheduled time to the reviewer; nothing counts yet.
    const sum = await v.get("/v1/volunteer/history/summary");
    expect(sum.body).toMatchObject({ completed_count: 1, total_hours: 0, pending_hours: 1.5 });
    const imp = await v.get("/v1/volunteer/impact");
    expect(imp.body.totals).toMatchObject({ hours: 0, pending_hours: 1.5, completed: 1 });
    const c = imp.body.timeline[0].contributions[0];
    expect(c).toMatchObject({ status: "pending", reported_hours: 1.5, source: "completion" });

    // The volunteer can't approve their own hours, and an outsider can't see them.
    const self = await v.post(`/v1/contributions/${c.id}/decide`, { action: "approve" });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe("self_approval");
    expect((await (await as(EMAILS.volunteer)).post(`/v1/contributions/${c.id}/decide`, { action: "approve" })).status).toBe(404);

    // The person who asked for help reviews it.
    const queue = await owner.get("/v1/contributions/review?as=requester");
    expect(queue.body.items.find((x: { id: string }) => x.id === c.id)).toMatchObject({ can_decide: true, volunteer_name: "hours.vol" });
    const ok = await owner.post(`/v1/contributions/${c.id}/decide`, { action: "approve" });
    expect(ok.body).toMatchObject({ status: "approved", approved_hours: 1.5 });
    expect((await v.get("/v1/volunteer/history/summary")).body.total_hours).toBe(1.5);

    // The volunteer reports extra time; the reviewer approves less, with a reason the volunteer sees.
    const rep = await v.post("/v1/volunteer/contributions", { applicationId: ap.body.applicationId, hours: 2, description: "Stayed late to help." });
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(rep.body.status).toBe("pending");
    expect((await owner.post(`/v1/contributions/${rep.body.id}/decide`, { action: "adjust", hours: 1 })).status).toBe(422); // reason required
    const adj = await owner.post(`/v1/contributions/${rep.body.id}/decide`, { action: "adjust", hours: 1, reason: "We closed at 6, so one extra hour." });
    expect(adj.body).toMatchObject({ status: "adjusted", approved_hours: 1 });
    const after = await v.get("/v1/volunteer/impact");
    expect(after.body.totals).toMatchObject({ hours: 2.5, pending_hours: 0 });
    const reported = after.body.timeline[0].contributions.find((x: { id: string }) => x.id === rep.body.id);
    expect(reported).toMatchObject({ reported_hours: 2, approved_hours: 1, last_reason: "We closed at 6, so one extra hour." });

    // History is append-only: both the report and the adjustment are kept, and can't be edited.
    const detail = await v.get(`/v1/contributions/${rep.body.id}`);
    expect(detail.body.history.map((h: { action: string }) => h.action)).toEqual(["created", "adjusted"]);
    await expect(pool.query("UPDATE contribution_decisions SET hours = 9 WHERE contribution_id = $1", [rep.body.id])).rejects.toThrow(/append-only/);

    // Outside service with no request stays self-reported and never counts as approved.
    const outside = await v.post("/v1/volunteer/contributions", { hours: 3, description: "Beach clean-up on my own" });
    expect(outside.body.status).toBe("self_reported");
    expect((await v.get("/v1/volunteer/impact")).body.totals).toMatchObject({ hours: 2.5, self_reported_hours: 3 });

    // The CSV keeps each entry and its status separate.
    const csv = await v.get("/v1/volunteer/history/export.csv");
    const lines = csv.text.split("\r\n");
    expect(lines.find((l: string) => l.includes("Stayed late")), JSON.stringify(lines)).toMatch(/"approved \(adjusted\)","2","1"/);
    expect(lines.find((l: string) => l.includes("Beach clean-up"))).toContain('"self-reported"');
  });

  it("the volunteer can dispute a decision; another reviewer or platform staff look again (CON-06)", async () => {
    await createUser({ email: "dispute.vol@thankyou.test", roles: ["volunteer"] });
    const owner = await as(EMAILS.requester);
    const d = await owner.post("/v1/requests", { title: "Hours: dispute", description: "Dispute test request here.", category: "errands", mode: "remote", scheduleType: "one_time", startsAt: soon(40), durationMinutes: 120 });
    await owner.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const v = await as("dispute.vol@thankyou.test");
    const ap = await v.post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    await owner.post(`/v1/requests/${d.body.id}/applicants/${ap.body.applicationId}`, { action: "accept" });
    await owner.post(`/v1/requests/${d.body.id}/applicants/${ap.body.applicationId}`, { action: "complete" });
    const cid = (await v.get("/v1/volunteer/impact")).body.timeline[0].contributions[0].id;
    await owner.post(`/v1/contributions/${cid}/decide`, { action: "reject", reason: "They didn't come." });
    const dsp = await v.post(`/v1/volunteer/contributions/${cid}/dispute`, { reason: "I was there the whole time; ask the front desk." });
    expect(dsp.body).toMatchObject({ status: "disputed", second_reviewers: 0 });
    // The person who decided can't decide the dispute.
    expect((await owner.post(`/v1/contributions/${cid}/decide`, { action: "approve" })).body.error.code).toBe("second_reviewer");
    // Platform staff can't approve service they didn't see: they let it stand or mark it unverifiable.
    const disputeId = dsp.body.dispute_id;
    const mod = await as(EMAILS.moderator);
    const r = await mod.post(`/v1/admin/disputes/${disputeId}/decide`, { status: "overturned", notes: "No evidence either way." });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const c = await v.get(`/v1/contributions/${cid}`);
    expect(c.body.status).toBe("unverified");
    expect(c.body.approved_hours).toBeNull();
    expect(c.body.history.map((h: { action: string }) => h.action)).toEqual(["created", "rejected", "disputed", "marked_unverified"]);
  });

  it("exports impact as CSV safe for spreadsheets", async () => {
    const uid = await userId(EMAILS.volunteer);
    await pool.query("INSERT INTO volunteer_task_entries (volunteer_user_id, task_date, task, duration_hours) VALUES ($1, CURRENT_DATE, '=HYPERLINK(\"x\")', 2)", [uid]);
    const r = await (await as(EMAILS.volunteer)).get("/v1/volunteer/history/export.csv");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.text).toContain('"date","activity","organization","status","reported_hours","approved_hours"');
    expect(r.text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe("password change (Settings → Account)", () => {
  it("needs the current password and signs out other sessions", async () => {
    await createUser({ email: "pw.change@thankyou.test", roles: ["volunteer"] });
    const a = await as("pw.change@thankyou.test");
    // A second device: its own session row.
    const uid = await userId("pw.change@thankyou.test");
    const otherToken = (await pool.query("INSERT INTO sessions (user_id, session_token, expires_at) VALUES ($1, gen_random_uuid(), NOW() + INTERVAL '1 day') RETURNING session_token", [uid])).rows[0].session_token;
    expect((await a.post("/v1/auth/change-password", { currentPassword: "wrong-one", newPassword: "New-Password-456!" })).status).toBe(400);
    const ok = await a.post("/v1/auth/change-password", { currentPassword: "Test-Password-123!", newPassword: "New-Password-456!" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await a.get("/v1/me")).status).toBe(200);
    expect((await anon().get("/v1/me").set("authorization", `Bearer ${otherToken}`)).status).toBe(401);
    const login = await anon().post("/v1/auth/login").send({ email: "pw.change@thankyou.test", password: "New-Password-456!" });
    expect(login.status).toBe(200);
  });
});
