import { describe, expect, it } from "vitest";
import { listRoutes, isPublicPath } from "../src/openapi/document";
import { anon, as, EMAILS, getApp } from "./helpers";

const FAKE_UUID = "00000000-0000-4000-8000-000000000000";
const fill = (p: string) =>
  p.replace(/:([A-Za-z_]+)/g, (_m, name: string) => (/slug/i.test(name) ? "no-such-org" : /token/i.test(name) ? "no-such-token" : FAKE_UUID));

const routes = () =>
  listRoutes(getApp()).filter((r) => !isPublicPath(r.path) && r.path !== "/v1/openapi.json" && r.path !== "/v1/docs");

describe("every private route rejects anonymous callers", () => {
  it("has a meaningful number of private routes", () => {
    expect(routes().length).toBeGreaterThan(120);
  });

  it.each(routes().map((r) => [r.method.toUpperCase(), r.path] as const))("%s %s → 401 without a session", async (method, path) => {
    const res = await (anon() as any)[method.toLowerCase()](fill(path)).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(401);
  });

  it.each(routes().map((r) => [r.method.toUpperCase(), r.path] as const))("%s %s → 401 with a forged session token", async (method, path) => {
    const res = await (anon() as any)[method.toLowerCase()](fill(path)).set("authorization", `Bearer ${FAKE_UUID}`).send({});
    expect(res.status).toBe(401);
  });
});

describe("role separation", () => {
  const adminRoutes = () => routes().filter((r) => r.path.startsWith("/v1/admin/"));
  const orgRoutes = () => routes().filter((r) => r.path.startsWith("/v1/org/") && !["/v1/org/me", "/v1/org/invites/accept"].includes(r.path));

  it.each(adminRoutes().map((r) => [r.method.toUpperCase(), r.path] as const))("volunteer cannot use %s %s", async (method, path) => {
    const api = await as(EMAILS.volunteer);
    const res = await (api as any)[method === "DELETE" ? "del" : method.toLowerCase()](fill(path), {});
    expect([403, 404]).toContain(res.status);
    if (res.status === 404) expect(res.body?.error?.code ?? res.body?.message).not.toMatch(/No route/);
  });

  it.each(orgRoutes().map((r) => [r.method.toUpperCase(), r.path] as const))("a non-member cannot use %s %s", async (method, path) => {
    const api = await as(EMAILS.volunteer);
    const res = await (api as any)[method === "DELETE" ? "del" : method.toLowerCase()](fill(path), {});
    expect([400, 403, 404]).toContain(res.status);
  });

  it("volunteer endpoints reject organization accounts", async () => {
    const api = await as(EMAILS.orgAdmin);
    const res = await api.get("/v1/volunteer/dashboard");
    expect(res.status).toBe(403);
  });

  it("requester endpoints reject volunteers", async () => {
    const api = await as(EMAILS.volunteer);
    const res = await api.get("/v1/requester/dashboard");
    expect(res.status).toBe(403);
  });
});
