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

  it("completed work counts toward impact hours", async () => {
    await createUser({ email: "hours.vol@thankyou.test", roles: ["volunteer"] });
    const owner = await as(EMAILS.requester);
    const d = await owner.post("/v1/requests", { title: "Hours: shift", description: "Impact hours test request.", category: "errands", mode: "remote", scheduleType: "one_time", startsAt: soon(40), durationMinutes: 90 });
    await owner.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const v = await as("hours.vol@thankyou.test");
    const ap = await v.post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    await owner.post(`/v1/requests/${d.body.id}/applicants/${ap.body.applicationId}`, { action: "accept" });
    await owner.post(`/v1/requests/${d.body.id}/applicants/${ap.body.applicationId}`, { action: "complete" });
    const sum = await v.get("/v1/volunteer/history/summary");
    expect(sum.body.completed_count).toBe(1);
    expect(sum.body.total_hours).toBe(1.5);
    expect(sum.body.recent_completed[0].title).toBe("Hours: shift");
  });

  it("exports impact as CSV safe for spreadsheets", async () => {
    const uid = await userId(EMAILS.volunteer);
    await pool.query("INSERT INTO volunteer_task_entries (volunteer_user_id, task_date, task, duration_hours) VALUES ($1, CURRENT_DATE, '=HYPERLINK(\"x\")', 2)", [uid]);
    const r = await (await as(EMAILS.volunteer)).get("/v1/volunteer/history/export.csv");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.text).toContain('"type","date","request","hours","detail","quantity"');
    expect(r.text).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
