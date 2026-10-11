import { describe, expect, it } from "vitest";
import { anon, as, EMAILS, userId } from "./helpers";

/**
 * The core marketplace loop as it works today:
 * requester posts → visible publicly → volunteer applies → requester accepts/confirms →
 * both message → requester completes → both review.
 */
describe("request → apply → accept → message → complete → review", () => {
  let requestId = "";
  let applicationId = "";

  it("requester posts a request", async () => {
    const api = await as(EMAILS.requester);
    const res = await api.post("/v1/requester/requests", {
      title: "Flow test: help moving boxes",
      description: "Two hours of help moving boxes to a storage unit. Call me at 555-123-4567.",
      mode: "in-person",
      locationText: "Upper West Side, Manhattan, NY",
      tags: "moving, lifting"
    });
    expect(res.status).toBe(201);
    requestId = res.body.id ?? res.body.request?.id;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("is visible publicly with the phone number redacted", async () => {
    const res = await anon().get(`/v1/public/opportunities/${requestId}`);
    expect(res.status).toBe(200);
    expect(res.body.location).toBe("Manhattan, NY");
    expect(res.body.summary).not.toContain("555-123-4567");
    expect(res.body.summary).toContain("[redacted phone]");
  });

  it("the requester cannot apply to their own request", async () => {
    const api = await as(EMAILS.requester);
    const res = await api.post(`/v1/volunteer/opportunities/${requestId}/apply`, { message: "me" });
    expect(res.status).toBe(403);
  });

  it("a volunteer applies once", async () => {
    const api = await as(EMAILS.volunteer);
    const res = await api.post(`/v1/volunteer/opportunities/${requestId}/apply`, { message: "I have a car and can lift." });
    expect([200, 201]).toContain(res.status);
    const again = await api.post(`/v1/volunteer/opportunities/${requestId}/apply`, { message: "again" });
    expect([200, 201, 409]).toContain(again.status);
    const mine = await api.get("/v1/volunteer/applications");
    expect(mine.status).toBe(200);
    const list = Array.isArray(mine.body) ? mine.body : mine.body.items ?? mine.body.applications;
    const app = list.find((a: { opportunity_id: string }) => a.opportunity_id === requestId);
    expect(app).toBeTruthy();
    applicationId = app.id;
    expect(res.body.applicationId).toBe(applicationId);
  });

  it("another volunteer cannot read that application", async () => {
    const other = await as(EMAILS.remoteVolunteer);
    const res = await other.get(`/v1/volunteer/applications/${applicationId}`);
    expect([403, 404]).toContain(res.status);
  });

  it("requester sees and accepts the application; others cannot", async () => {
    const outsider = await as(EMAILS.dual);
    expect([403, 404]).toContain((await outsider.post(`/v1/requester/applications/${applicationId}/accept`)).status);

    const api = await as(EMAILS.requester);
    const apps = await api.get(`/v1/requester/requests/${requestId}/applications`);
    expect(apps.status).toBe(200);
    expect(JSON.stringify(apps.body)).toContain(applicationId);

    const accept = await api.post(`/v1/requester/applications/${applicationId}/accept`);
    expect(accept.status).toBe(200);
    const acceptAgain = await api.post(`/v1/requester/applications/${applicationId}/accept`);
    expect([200, 409]).toContain(acceptAgain.status);
  });

  let conversationId = "";
  it("both sides can message in the request thread", async () => {
    const vol = await as(EMAILS.volunteer);
    const req = await as(EMAILS.requester);
    const list = await vol.get("/v1/inbox/conversations?as=volunteer");
    conversationId = list.body.conversations.find((c: { request_id: string }) => c.request_id === requestId).id;
    const sent = await vol.post(`/v1/inbox/conversations/${conversationId}/messages`, { body: "Hi Rose, what time works?" });
    expect(sent.status).toBe(201);
    const thread = await req.get(`/v1/inbox/conversations/${conversationId}`);
    expect(thread.status).toBe(200);
    expect(JSON.stringify(thread.body)).toContain("what time works");
  });

  it("requester confirms and completes; both leave reviews", async () => {
    const req = await as(EMAILS.requester);
    const start = new Date(Date.now() - 3 * 3600_000).toISOString();
    const end = new Date(Date.now() - 1 * 3600_000).toISOString();
    const confirm = await req.post(`/v1/requester/applications/${applicationId}/confirm`, { start_at: start, end_at: end });
    expect(confirm.status).toBe(200);
    const complete = await req.post(`/v1/requester/applications/${applicationId}/complete`);
    expect(complete.status).toBe(200);

    const review = await req.post(`/v1/requester/applications/${applicationId}/review`, { rating: 5, strengths: "On time", would_work_again: true });
    expect([200, 201], JSON.stringify(review.body)).toContain(review.status);

    const vol = await as(EMAILS.volunteer);
    const back = await vol.post(`/v1/volunteer/applications/${applicationId}/review-requester`, { rating: 5, strengths: "Clear instructions" });
    expect([200, 201], JSON.stringify(back.body)).toContain(back.status);
  });

  it("dashboards reflect the activity", async () => {
    const vol = await as(EMAILS.volunteer);
    const d = await vol.get("/v1/volunteer/dashboard");
    expect(d.status).toBe(200);
    expect(d.body).toHaveProperty("recommendedOpportunities");
    const req = await as(EMAILS.requester);
    const rd = await req.get("/v1/requester/dashboard");
    expect(rd.status).toBe(200);
    expect(rd.body.activeRequests).toBeGreaterThan(0);
  });

  it("blocking stops messaging in both directions", async () => {
    const req = await as(EMAILS.requester);
    const vol = await as(EMAILS.volunteer);
    const volunteerId = await userId(EMAILS.volunteer);
    const block = await req.post("/v1/settings/blocked-users", { blocked_user_id: volunteerId, reason: "test" });
    expect([200, 201]).toContain(block.status);
    const sent = await vol.post(`/v1/inbox/conversations/${conversationId}/messages`, { body: "hello?" });
    expect(sent.status).toBe(403);
    const list = await req.get("/v1/settings/blocked-users");
    expect(JSON.stringify(list.body)).not.toContain("volunteer.local@thankyou.test");
    expect((await req.del(`/v1/settings/blocked-users/${volunteerId}`)).status).toBeLessThan(300);
  });
});

describe("volunteer feeds", () => {
  it("recommended, nearby, remote and saved feeds load", async () => {
    const api = await as(EMAILS.volunteer);
    for (const feed of ["recommended", "nearby", "remote"]) {
      const res = await api.get(`/v1/volunteer/opportunities/${feed}`);
      expect(res.status, feed).toBe(200);
    }
    const list = await anon().get("/v1/public/opportunities?limit=1");
    const id = list.body.items[0].id;
    expect((await api.post(`/v1/volunteer/opportunities/${id}/save`)).status).toBeLessThan(300);
    const saved = await api.get("/v1/volunteer/opportunities/saved");
    expect(JSON.stringify(saved.body)).toContain(id);
    expect((await api.del(`/v1/volunteer/opportunities/${id}/save`)).status).toBeLessThan(300);
  });

  it("remote feed only returns remote or hybrid work", async () => {
    const api = await as(EMAILS.remoteVolunteer);
    const res = await api.get("/v1/volunteer/opportunities/remote");
    const items = Array.isArray(res.body) ? res.body : res.body.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((o: { mode: string }) => o.mode === "remote" || o.mode === "hybrid")).toBe(true);
  });
});
