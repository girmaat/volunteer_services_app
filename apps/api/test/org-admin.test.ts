import { describe, expect, it } from "vitest";
import { anon, as, EMAILS } from "./helpers";

describe("organization area", () => {
  it("org admin sees org context, dashboard and roster; members get org context too", async () => {
    const api = await as(EMAILS.orgAdmin);
    const me = await api.get("/v1/org/me");
    expect(me.status).toBe(200);
    expect(me.body.org.slug).toBeTruthy();
    for (const p of ["/v1/org/dashboard", "/v1/org/requests", "/v1/org/applications", "/v1/org/roster", "/v1/org/members", "/v1/org/incidents", "/v1/org/documents", "/v1/org/reports/impact", "/v1/org/messages/inbox"]) {
      const res = await api.get(p);
      expect([200, 404], p).toContain(res.status);
      if (res.status === 404) expect(res.body.error?.code, p).not.toBe("not_found");
    }
    const member = await as(EMAILS.orgMember);
    expect((await member.get("/v1/org/me")).status).toBe(200);
  });

  it("org admin posts a request that appears in the public list under the org", async () => {
    const api = await as(EMAILS.orgAdmin);
    const res = await api.post("/v1/org/requests", {
      title: "Org test: weekend pantry shift",
      description: "Help pack boxes for families on Saturday morning.",
      mode: "in-person",
      location_text: "Queens, NY",
      tags: ["food"]
    });
    expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
    expect(res.body.request.status).toBe("open");
    const me = await api.get("/v1/org/me");
    const pub = await anon().get(`/v1/public/opportunities?org=${me.body.org.slug}&q=pantry%20shift`);
    expect(pub.body.items.some((o: { title: string }) => o.title === "Org test: weekend pantry shift")).toBe(true);
  });

  it("CSV exports require org membership", async () => {
    const outsider = await as(EMAILS.volunteer);
    expect([403, 404]).toContain((await outsider.get("/v1/org/roster")).status);
  });
});

describe("platform admin", () => {
  it("can load every admin list", async () => {
    const api = await as(EMAILS.admin);
    for (const p of ["/v1/admin/dashboard", "/v1/admin/users", "/v1/admin/organizations", "/v1/admin/requests", "/v1/admin/reports", "/v1/admin/incidents", "/v1/admin/enforcement/actions", "/v1/admin/user-verification/queue", "/v1/admin/org-verification/queue"]) {
      const res = await api.get(p);
      expect([200], `${p} ${JSON.stringify(res.body).slice(0, 200)}`).toContain(res.status);
    }
  });

  it("user list paginates and never returns password hashes", async () => {
    const api = await as(EMAILS.admin);
    const res = await api.get("/v1/admin/users?limit=2");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  it("can toggle maintenance mode, which the public status endpoint reflects", async () => {
    const api = await as(EMAILS.admin);
    const on = await api.post("/v1/admin/platform/settings/maintenance", { enabled: true, message: "Back soon" });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect((await anon().get("/v1/platform/status")).body.maintenance.enabled).toBe(true);
    await api.post("/v1/admin/platform/settings/maintenance", { enabled: false });
    expect((await anon().get("/v1/platform/status")).body.maintenance.enabled).toBe(false);
  });
});

describe("settings", () => {
  it("overview counts and privacy settings work", async () => {
    const api = await as(EMAILS.requester);
    for (const p of ["/v1/settings/notifications", "/v1/settings/notifications/unseen-count", "/v1/settings/privacy-safety", "/v1/settings/blocked-users/count", "/v1/settings/reports/count", "/v1/settings/reports"]) {
      expect((await api.get(p)).status, p).toBe(200);
    }
    const counts = await api.get("/v1/settings/reports/count");
    expect(counts.body).toHaveProperty("reports_open");
  });
});

describe("org application decisions (waitlist workflow)", () => {
  it("waitlists then accepts an application, and rejects invalid transitions", async () => {
    const org = await as(EMAILS.orgAdmin);
    const me = await org.get("/v1/org/me");
    const slug = me.body.org.slug;
    const list = await anon().get(`/v1/public/opportunities?org=${slug}&mode=remote&limit=5`);
    const oppId = list.body.items[0].id;

    const vol = await as(EMAILS.remoteVolunteer);
    const applied = await vol.post(`/v1/volunteer/opportunities/${oppId}/apply`, { message: "Happy to help." });
    expect([200, 201]).toContain(applied.status);
    const appId = applied.body.applicationId;

    const wl = await org.patch(`/v1/org/applications/${appId}`, { status: "waitlisted" });
    expect(wl.status, JSON.stringify(wl.body)).toBe(200);
    expect(wl.body.status).toBe("waitlisted");
    const acc = await org.patch(`/v1/org/applications/${appId}`, { status: "accepted" });
    expect(acc.body.status).toBe("accepted");
    const bad = await org.patch(`/v1/org/applications/${appId}`, { status: "pending" });
    expect(bad.status).toBe(409);

    const outsider = await as(EMAILS.requester);
    expect([403, 404]).toContain((await outsider.patch(`/v1/org/applications/${appId}`, { status: "rejected" })).status);
  });
});
