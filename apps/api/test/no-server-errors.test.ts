import { describe, expect, it } from "vitest";
import { listRoutes } from "../src/openapi/document";
import { as, EMAILS, getApp } from "./helpers";

const FAKE_UUID = "00000000-0000-4000-8000-000000000000";
const fill = (p: string) =>
  p.replace(/:([A-Za-z_]+)/g, (_m, name: string) => (/slug/i.test(name) ? "no-such-org" : /token/i.test(name) ? "no-such-token" : FAKE_UUID));

// Endpoints whose side effects would disturb other tests when called with an empty body.
const SKIP = new Set(["POST /v1/auth/logout", "POST /v1/admin/platform/settings/maintenance"]);

/**
 * Smoke sweep: every route, called by every role with placeholder ids and an empty body, must answer
 * with a deliberate status (2xx/3xx/4xx), never a 500. This is what caught several SQL bugs.
 */
describe.each([
  ["volunteer", EMAILS.volunteer],
  ["requester", EMAILS.requester],
  ["org admin", EMAILS.orgAdmin],
  ["platform admin", EMAILS.admin]
])("no server errors for %s", (_label, email) => {
  const routes = listRoutes(getApp()).filter((r) => !SKIP.has(`${r.method.toUpperCase()} ${r.path}`) && r.path.startsWith("/v1/"));
  it.each(routes.map((r) => [r.method.toUpperCase(), r.path] as const))("%s %s", async (method, path) => {
    const api = await as(email);
    const fn = method === "DELETE" ? "del" : method.toLowerCase();
    const res = await (api as any)[fn](fill(path), {});
    expect(res.status, `${method} ${path}: ${JSON.stringify(res.body).slice(0, 300)}`).toBeLessThan(500);
  });
});
