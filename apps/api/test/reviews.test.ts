import { describe, expect, it } from "vitest";
import { anon, as, createUser, EMAILS, pool, userId } from "./helpers";
import { revealDueReviews } from "../src/modules/reviews/service";

const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function setup(title: string, vol: string, startsInHours = 72) {
  await createUser({ email: vol, roles: ["volunteer"] });
  await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = $1", [vol]);
  const owner = await as(EMAILS.requester);
  const d = await owner.post("/v1/requests", {
    title,
    description: "Reviews test request with a description long enough.",
    category: "errands",
    mode: "remote",
    scheduleType: "one_time",
    startsAt: soon(startsInHours),
    volunteersNeeded: 2
  });
  await owner.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
  const ap = await (await as(vol)).post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "Happy to help" });
  await owner.post(`/v1/requester/applications/${ap.body.applicationId}/accept`);
  return { requestId: String(d.body.id), applicationId: String(ap.body.applicationId) };
}

describe("double-blind structured reviews", () => {
  it("hides each review until both sides submit, then locks them", async () => {
    const { requestId, applicationId } = await setup("Reviews: blind", "rev.vol@thankyou.test");
    const owner = await as(EMAILS.requester);
    const vol = await as("rev.vol@thankyou.test");
    expect((await owner.post("/v1/reviews", { applicationId, overall: 5 })).status).toBe(409); // not completed yet
    await owner.post(`/v1/requester/applications/${applicationId}/confirm`, { start_at: soon(-3), end_at: soon(-1) });
    await owner.post(`/v1/requester/applications/${applicationId}/complete`);

    const first = await owner.post("/v1/reviews", { applicationId, overall: 5, reliability: 5, communication: 4, skill: 5, comment: "Great help", wouldWorkAgain: true });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.published).toBe(false);
    expect((await owner.post("/v1/reviews", { applicationId, overall: 6 })).status).toBe(400);
    // The volunteer can't see it yet; the public profile doesn't count it.
    let mine = await vol.get(`/v1/reviews/applications/${applicationId}`);
    expect(mine.body.theirs).toBeNull();
    expect(mine.body.theirs_submitted).toBe(true);
    const volId = await userId("rev.vol@thankyou.test");
    expect((await anon().get(`/v1/public/volunteers/${volId}`)).body?.reviews_count ?? 0).toBe(0);

    const second = await vol.post("/v1/reviews", { applicationId, overall: 4, clarity: 3, comment: "Instructions could be clearer" });
    expect(second.body.published).toBe(true);
    mine = await vol.get(`/v1/reviews/applications/${applicationId}`);
    expect(mine.body.theirs.comment).toBe("Great help");
    expect(mine.body.theirs.skill).toBe(5);
    const theirs = await owner.get(`/v1/reviews/applications/${applicationId}`);
    expect(theirs.body.theirs.clarity).toBe(3);
    // Locked once published.
    expect((await owner.post("/v1/reviews", { applicationId, overall: 1 })).status).toBe(409);
    expect((await (await as(EMAILS.remoteVolunteer)).get(`/v1/reviews/applications/${applicationId}`)).status).toBe(404);
    expect(requestId).toBeTruthy();
  });

  it("publishes a lone review 14 days after completion", async () => {
    const { applicationId } = await setup("Reviews: timeout", "rev2.vol@thankyou.test");
    const owner = await as(EMAILS.requester);
    await owner.post(`/v1/requester/applications/${applicationId}/confirm`, { start_at: soon(-3), end_at: soon(-1) });
    await owner.post(`/v1/requester/applications/${applicationId}/complete`);
    await owner.post("/v1/reviews", { applicationId, overall: 4 });
    await pool.query("UPDATE request_applications SET completed_at = NOW() - INTERVAL '15 days' WHERE id = $1", [applicationId]);
    expect(await revealDueReviews()).toBeGreaterThan(0);
    const v = await (await as("rev2.vol@thankyou.test")).get(`/v1/reviews/applications/${applicationId}`);
    expect(v.body.theirs.overall).toBe(4);
  });
});

describe("reliability: late cancellations and no-shows", () => {
  it("a volunteer canceling inside 24 hours is a late cancellation; the waitlist moves up", async () => {
    const { requestId, applicationId } = await setup("Reliability: late cancel", "late.vol@thankyou.test", 10);
    const r = await (await as("late.vol@thankyou.test")).post(`/v1/volunteer/applications/${applicationId}/cancel`, { reason: "Sick" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.late_cancel).toBe(true);
    const rel = await (await as(EMAILS.requester)).get(`/v1/users/${await userId("late.vol@thankyou.test")}/reliability`);
    expect(rel.body.late_cancels).toBe(1);
    const n = await pool.query("SELECT COUNT(*)::int AS c FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.title LIKE 'A volunteer canceled%'", [EMAILS.requester]);
    expect(n.rows[0].c).toBeGreaterThan(0);
    expect(requestId).toBeTruthy();
  });

  it("canceling days ahead is not late", async () => {
    const { applicationId } = await setup("Reliability: early cancel", "early.vol@thankyou.test", 96);
    const r = await (await as("early.vol@thankyou.test")).post(`/v1/volunteer/applications/${applicationId}/cancel`, {});
    expect(r.body.late_cancel).toBe(false);
  });

  it("organizers mark no-shows only after the start; the volunteer can dispute", async () => {
    const { requestId, applicationId } = await setup("Reliability: no-show", "noshow.vol@thankyou.test", 48);
    const owner = await as(EMAILS.requester);
    expect((await owner.post(`/v1/applications/${applicationId}/no-show`)).status).toBe(409);
    await pool.query("UPDATE service_requests SET starts_at = NOW() - INTERVAL '2 hours' WHERE id = $1", [requestId]);
    expect((await (await as(EMAILS.remoteVolunteer)).post(`/v1/applications/${applicationId}/no-show`)).status).toBe(404);
    const ns = await owner.post(`/v1/applications/${applicationId}/no-show`);
    expect(ns.status, JSON.stringify(ns.body)).toBe(200);
    const rel = await owner.get(`/v1/users/${await userId("noshow.vol@thankyou.test")}/reliability`);
    expect(rel.body.no_shows).toBe(1);
    const vol = await as("noshow.vol@thankyou.test");
    expect((await vol.post("/v1/disputes", { applicationId, kind: "no_show", reason: "short" })).status).toBe(400);
    const d = await vol.post("/v1/disputes", { applicationId, kind: "no_show", reason: "I was there at 10 and signed in at the front desk." });
    expect(d.status).toBe(201);
    expect((await vol.post("/v1/disputes", { applicationId, kind: "no_show", reason: "I was there at 10 and signed in at the front desk." })).status).toBe(409);
    const mine = await vol.get("/v1/disputes");
    expect(mine.body.disputes[0].status).toBe("open");
    expect((await owner.get("/v1/disputes")).body.disputes.some((x: { id: string }) => x.id === d.body.id)).toBe(true);
  });
});

describe("unified applicants API (requesters and organizations)", () => {
  it("lists applicants with reliability and runs every decision", async () => {
    await createUser({ email: "appl.a@thankyou.test", roles: ["volunteer"] });
    await createUser({ email: "appl.b@thankyou.test", roles: ["volunteer"] });
    const admin = await as(EMAILS.orgAdmin);
    await admin.post("/v1/me/context", { context: "org:harbor-food-bank" });
    const d = await admin.post("/v1/requests", { as: "org", title: "Applicants: pantry", description: "A request for the applicants API tests.", category: "food", mode: "remote", scheduleType: "one_time", startsAt: soon(30), volunteersNeeded: 1 });
    await admin.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
    const a1 = await (await as("appl.a@thankyou.test")).post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    const a2 = await (await as("appl.b@thankyou.test")).post(`/v1/volunteer/opportunities/${d.body.id}/apply`, { message: "hi" });
    const list = await admin.get(`/v1/requests/${d.body.id}/applicants`);
    expect(list.status).toBe(200);
    expect(list.body.applicants).toHaveLength(2);
    expect(list.body.applicants[0].reliability).toMatchObject({ completed: 0, no_shows: 0 });
    expect(list.body.applicants[0].email).toBeNull();
    const go = (appId: string, action: string, extra: Record<string, unknown> = {}) => admin.post(`/v1/requests/${d.body.id}/applicants/${appId}`, { action, ...extra });
    expect((await go(a1.body.applicationId, "accept")).body.status).toBe("accepted");
    expect((await go(a2.body.applicationId, "accept")).status).toBe(409);
    expect((await go(a2.body.applicationId, "waitlist")).body.status).toBe("waitlisted");
    expect((await go(a1.body.applicationId, "confirm")).body.status).toBe("confirmed");
    expect((await go(a1.body.applicationId, "decline")).status).toBe(409);
    const after = await admin.get(`/v1/requests/${d.body.id}/applicants`);
    expect(after.body.applicants.find((x: { id: string }) => x.id === a1.body.applicationId).email).toBe("appl.a@thankyou.test");
    expect((await go(a1.body.applicationId, "cancel")).body.status).toBe("canceled");
    // The waitlisted applicant is offered the spot; the organizer can accept them straight away.
    const st = await pool.query("SELECT status FROM request_applications WHERE id = $1", [a2.body.applicationId]);
    expect(st.rows[0].status).toBe("offered");
    expect((await go(a2.body.applicationId, "accept")).body.status).toBe("accepted");
    expect((await (await as(EMAILS.orgMember)).post(`/v1/requests/${d.body.id}/applicants/${a2.body.applicationId}`, { action: "decline" })).status).toBe(404);
    expect((await (await as(EMAILS.orgMember)).get(`/v1/requests/${d.body.id}/applicants`)).status).toBe(200);
  });
});
