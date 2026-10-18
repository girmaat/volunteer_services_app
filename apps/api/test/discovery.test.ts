import { describe, expect, it } from "vitest";
import { anon, as, createUser, EMAILS, pool } from "./helpers";

type Item = { id: string; title: string; mode: string; category: string; distance_miles: number | null; match: { reasons: string[]; score: number; warnings: string[] } | null; is_sensitive: boolean };

describe("discovery: public", () => {
  it("lists live requests without private fields", async () => {
    const res = await anon().get("/v1/discovery/opportunities?limit=50");
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(res.body.items.length).toBeGreaterThan(10);
    expect(body).not.toMatch(/exact_address|location_lat|location_lng|requester_user_id|@volunteer-services-app\.test/);
    expect(body).not.toContain("87-10 Queens Blvd");
    const titles = res.body.items.map((i: Item) => i.title);
    expect(titles).not.toContain("Help hanging curtains and a shelf"); // sensitive, in review
    expect(titles).not.toContain("Draft: garden cleanup (not published)");
    expect(res.body.items.every((i: Item) => i.match === null)).toBe(true);
  });

  it("full-text search ranks matches and respects filters", async () => {
    const q = await anon().get("/v1/discovery/opportunities?q=algebra");
    expect(q.body.items[0].title).toBe("Algebra tutoring (grade 8)");
    const stem = await anon().get("/v1/discovery/opportunities?q=tutors");
    expect(stem.body.items.some((i: Item) => i.title.includes("tutoring"))).toBe(true);
    const cat = await anon().get("/v1/discovery/opportunities?category=food&limit=50");
    expect(cat.body.items.length).toBeGreaterThan(0);
    expect(cat.body.items.every((i: Item) => i.category === "food")).toBe(true);
    const mode = await anon().get("/v1/discovery/opportunities?mode=remote&limit=50");
    expect(mode.body.items.every((i: Item) => i.mode === "remote")).toBe(true);
    const skills = await anon().get("/v1/discovery/opportunities?skills=spanish&limit=50");
    expect(skills.body.items.length).toBeGreaterThan(1);
    const verified = await anon().get("/v1/discovery/opportunities?verified_org=true&limit=50");
    expect(verified.body.items.every((i: { organization_verified: boolean }) => i.organization_verified)).toBe(true);
    expect((await anon().get("/v1/discovery/opportunities?mode=boat")).status).toBe(400);
  });

  it("paginates with an opaque cursor", async () => {
    const p1 = await anon().get("/v1/discovery/opportunities?limit=3");
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await anon().get(`/v1/discovery/opportunities?limit=3&cursor=${p1.body.nextCursor}`);
    const ids1 = p1.body.items.map((i: Item) => i.id);
    expect(p2.body.items.some((i: Item) => ids1.includes(i.id))).toBe(false);
  });

  it("personalised tabs need a volunteer", async () => {
    expect((await anon().get("/v1/discovery/opportunities?tab=recommended")).status).toBe(401);
    expect((await (await as(EMAILS.requester)).get("/v1/discovery/opportunities?tab=nearby")).status).toBe(401);
  });
});

describe("discovery: matching", () => {
  it("recommends remote tutoring to the remote tutor and explains why", async () => {
    const res = await (await as(EMAILS.remoteVolunteer)).get("/v1/discovery/opportunities?tab=recommended&limit=10");
    expect(res.status).toBe(200);
    const top: Item = res.body.items[0];
    expect(["remote", "hybrid"]).toContain(top.mode);
    expect(top.match!.reasons.join(" ")).toMatch(/skills|time zone|cause/);
    // Remote-only volunteer: no in-person-only items.
    expect(res.body.items.every((i: Item) => i.mode !== "in-person")).toBe(true);
    const scores = res.body.items.map((i: Item) => i.match!.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("Near you returns in-person requests inside the radius, nearest first", async () => {
    const res = await (await as(EMAILS.volunteer)).get("/v1/discovery/opportunities?tab=nearby&limit=50");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const d = res.body.items.map((i: Item) => i.distance_miles as number);
    expect(d.every((x: number) => x <= 15)).toBe(true);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(res.body.items.every((i: Item) => i.mode !== "remote")).toBe(true);
    expect(res.body.items[0].match.reasons.some((r: string) => /mi$/.test(r))).toBe(true);
    const narrow = await (await as(EMAILS.volunteer)).get("/v1/discovery/opportunities?tab=nearby&radius=3&limit=50");
    expect(narrow.body.items.length).toBeLessThan(res.body.items.length);
    expect(narrow.body.items.every((i: Item) => (i.distance_miles as number) <= 3)).toBe(true);
  });

  it("asks for a location when the volunteer has none", async () => {
    await createUser({ email: "noloc.vol@volunteer-services-app.test", roles: ["volunteer"] });
    const res = await (await as("noloc.vol@volunteer-services-app.test")).get("/v1/discovery/opportunities?tab=nearby");
    expect(res.body.needsLocation).toBe(true);
    expect(res.body.items).toEqual([]);
  });

  it("warns when a request needs a car the volunteer doesn't have", async () => {
    const res = await (await as(EMAILS.remoteVolunteer)).get("/v1/discovery/opportunities?q=deliver%20meals");
    const item = res.body.items.find((i: Item) => i.title.startsWith("Deliver meals"));
    expect(item.match.warnings).toContain("needs a car");
  });
});

describe("sensitive requests and location privacy", () => {
  it("approved sensitive requests show only to verified volunteers", async () => {
    const r = await pool.query("UPDATE service_requests SET status = 'open', review_status = 'approved', published_at = NOW() WHERE title = 'Help hanging curtains and a shelf' RETURNING id");
    const id = r.rows[0].id as string;
    const trusted = await (await as(EMAILS.volunteer)).get("/v1/discovery/opportunities?q=curtains");
    expect(trusted.body.items.some((i: Item) => i.id === id)).toBe(true);
    const basic = await (await as(EMAILS.remoteVolunteer)).get("/v1/discovery/opportunities?q=curtains");
    expect(basic.body.items.some((i: Item) => i.id === id)).toBe(false);
    expect((await anon().get(`/v1/discovery/opportunities/${id}`)).status).toBe(404);
    expect((await (await as(EMAILS.remoteVolunteer)).get(`/v1/volunteer/opportunities/${id}`)).status).toBe(404);
  });

  it("reveals the exact address only after acceptance", async () => {
    await createUser({ email: "addr.vol@volunteer-services-app.test", roles: ["volunteer"] });
    const r = await pool.query("SELECT id FROM service_requests WHERE title = 'Saturday distribution shift'");
    const id = r.rows[0].id as string;
    const vol = await as("addr.vol@volunteer-services-app.test");
    let d = await vol.get(`/v1/discovery/opportunities/${id}`);
    expect(d.body.exact_address).toBeNull();
    expect(d.body.address_hidden).toBe(true);
    expect(d.body.public_area).toBe("Queens, NY");
    expect(d.body.can_apply).toBe(true);
    const applied = await vol.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "I can help" });
    expect(applied.status).toBe(201);
    d = await vol.get(`/v1/discovery/opportunities/${id}`);
    expect(d.body.exact_address).toBeNull();
    expect(d.body.application.status).toBe("pending");
    const app = await vol.get(`/v1/volunteer/applications/${applied.body.applicationId}`);
    expect(app.body.opportunity.exact_address).toBeNull();

    const org = await as(EMAILS.orgAdmin);
    await org.post("/v1/me/context", { context: "org:harbor-food-bank" });
    const acc = await org.patch(`/v1/org/applications/${applied.body.applicationId}`, { status: "accepted" });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    d = await vol.get(`/v1/discovery/opportunities/${id}`);
    expect(d.body.exact_address).toBe("87-10 Queens Blvd, Elmhurst, NY");
    expect((await vol.get(`/v1/volunteer/applications/${applied.body.applicationId}`)).body.opportunity.exact_address).toBe("87-10 Queens Blvd, Elmhurst, NY");
    // Other volunteers still don't see it.
    expect((await (await as(EMAILS.volunteer)).get(`/v1/discovery/opportunities/${id}`)).body.exact_address).toBeNull();
  });

  it("masks phone numbers and emails in the description until the volunteer is accepted", async () => {
    await createUser({ email: "mask.vol@volunteer-services-app.test", roles: ["volunteer"] });
    const r = await pool.query("SELECT id FROM service_requests WHERE title = 'Saturday distribution shift'");
    const id = r.rows[0].id as string;
    await pool.query("UPDATE service_requests SET description = description || ' Text me at 718-555-0142 or write to shift.lead@example.org.' WHERE id = $1", [id]);
    try {
      const pub = await anon().get(`/v1/discovery/opportunities?q=distribution&limit=50`);
      expect(JSON.stringify(pub.body)).not.toMatch(/718-555-0142|shift\.lead@example\.org/);
      const vol = await as("mask.vol@volunteer-services-app.test");
      let d = await vol.get(`/v1/discovery/opportunities/${id}`);
      expect(d.body.description).not.toMatch(/718-555-0142|shift\.lead@example\.org/);
      const applied = await vol.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "Happy to help" });
      const org = await as(EMAILS.orgAdmin);
      await org.post("/v1/me/context", { context: "org:harbor-food-bank" });
      await org.patch(`/v1/org/applications/${applied.body.applicationId}`, { status: "accepted" });
      d = await vol.get(`/v1/discovery/opportunities/${id}`);
      expect(d.body.description).toContain("718-555-0142");
    } finally {
      await pool.query("UPDATE service_requests SET description = regexp_replace(description, ' Text me at .*$', '') WHERE id = $1", [id]);
    }
  });

  it("never lists your own requests back to you", async () => {
    const api = await as(EMAILS.dual);
    const created = await api.post("/v1/requests", {
      title: "Dual: water my plants",
      description: "Water the plants on my balcony while I'm away for a week.",
      category: "errands",
      mode: "remote",
      scheduleType: "flexible_window"
    });
    await api.post(`/v1/requests/${created.body.id}/transition`, { event: "publish" });
    const mine = await api.get("/v1/discovery/opportunities?q=plants");
    expect(mine.body.items.some((i: Item) => i.id === created.body.id)).toBe(false);
    expect((await anon().get("/v1/discovery/opportunities?q=plants")).body.items.some((i: Item) => i.id === created.body.id)).toBe(true);
  });
});
