import { describe, expect, it } from "vitest";
import { anon, as, EMAILS } from "./helpers";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

describe("public read API", () => {
  it("lists open opportunities without a session, paginated", async () => {
    const first = await anon().get("/v1/public/opportunities?limit=5");
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(5);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await anon().get(`/v1/public/opportunities?limit=5&cursor=${first.body.nextCursor}`);
    expect(second.status).toBe(200);
    const ids = new Set([...first.body.items, ...second.body.items].map((o: { id: string }) => o.id));
    expect(ids.size).toBe(10);
  });

  it("filters by mode and search text", async () => {
    const remote = await anon().get("/v1/public/opportunities?mode=remote&limit=50");
    expect(remote.body.items.length).toBeGreaterThan(0);
    expect(remote.body.items.every((o: { mode: string; location: string }) => o.mode === "remote" && o.location === "Remote")).toBe(true);
    const q = await anon().get("/v1/public/opportunities?q=tutoring");
    expect(q.body.items.some((o: { title: string }) => /tutoring/i.test(o.title))).toBe(true);
  });

  it("never exposes contact details, exact addresses or private ids", async () => {
    const res = await anon().get("/v1/public/opportunities?limit=50");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(EMAIL_RE);
    expect(text).not.toMatch(/requester_user_id|location_lat|location_lng|location_text/);
  });

  it("shows the request's own city, not the organization's", async () => {
    const res = await anon().get("/v1/public/opportunities?q=Event%20setup");
    expect(res.body.items[0].location).toBe("Newark, NJ");
  });

  it("returns 404 for unknown or invalid ids", async () => {
    expect((await anon().get("/v1/public/opportunities/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await anon().get("/v1/public/opportunities/not-a-uuid")).status).toBe(400);
  });

  it("lists organizations for anyone, including users with reported share links", async () => {
    const res = await anon().get("/v1/public/organizations");
    expect(res.status).toBe(200);
    expect(res.body.items.map((o: { slug: string }) => o.slug)).toContain("harbor-food-bank");
    const api = await as(EMAILS.volunteer);
    expect((await api.get("/v1/public/organizations")).status).toBe(200);
  });

  it("serves an organization profile with only http(s) links", async () => {
    const res = await anon().get("/v1/public/organizations/harbor-food-bank");
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.open_requests).toBeGreaterThan(0);
    expect(res.body.website_url === null || /^https?:\/\//.test(res.body.website_url)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(EMAIL_RE);
  });

  it("stores contact messages and silently drops honeypot submissions", async () => {
    const ok = await anon().post("/v1/public/contact").send({ name: "Ana", email: "ana@example.com", message: "Hi" });
    expect(ok.status).toBe(202);
    const bot = await anon().post("/v1/public/contact").send({ name: "Bot", email: "b@example.com", message: "spam", website: "x" });
    expect(bot.status).toBe(202);
    const bad = await anon().post("/v1/public/contact").send({ name: "", email: "nope", message: "" });
    expect(bad.status).toBe(400);
  });

  it("serves health and a complete OpenAPI document", async () => {
    expect((await anon().get("/v1/health")).body.status).toBe("ok");
    const doc = await anon().get("/v1/openapi.json");
    expect(doc.status).toBe(200);
    expect(Object.keys(doc.body.paths).length).toBeGreaterThan(150);
    expect(doc.body.paths["/v1/public/opportunities"].get.responses["200"]).toBeTruthy();
  });

  it("returns a JSON 404 for unknown routes and a 400 for malformed JSON", async () => {
    const nf = await anon().get("/v1/does-not-exist");
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe("not_found");
    const bad = await anon().post("/v1/auth/login").set("content-type", "application/json").send("{bad json");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid_json");
  });

  it("sets security headers and a request id", async () => {
    const res = await anon().get("/v1/health");
    expect(res.headers["x-request-id"]).toBeTruthy();
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });
});
