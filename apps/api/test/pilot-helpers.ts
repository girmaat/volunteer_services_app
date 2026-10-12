/** Shared builders for pilot-rule tests: each test gets its own organization. */
import { expect } from "vitest";
import { as, createUser, pool } from "./helpers";

export const soon = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();
let seq = 0;
export const uniq = (p: string) => `${p}-${process.pid}-${++seq}`;

/** A fresh organization with an admin (owner), a manager and a member. */
export async function makeOrg(opts: { verified?: boolean; policy?: string } = {}) {
  const slug = uniq("pilot-org");
  await pool.query(
    `INSERT INTO organizations (slug, name, summary, location, onboarding_completed, verification_status, verified_at, publication_policy)
     VALUES ($1, $2, 'A test organization for pilot rules.', 'Queens, NY', TRUE, $3, $4, $5)`,
    [slug, `Org ${slug}`, opts.verified === false ? "required" : "approved", opts.verified === false ? null : new Date(), opts.policy ?? "owner_first_and_high_risk"]
  );
  const admin = `${slug}.admin@thankyou.test`;
  const manager = `${slug}.manager@thankyou.test`;
  const member = `${slug}.member@thankyou.test`;
  await createUser({ email: admin, org: { slug, role: "admin" } });
  await createUser({ email: manager, org: { slug, role: "manager" } });
  await createUser({ email: member, org: { slug, role: "member" } });
  return { slug, admin, manager, member };
}

export const FIELDS = {
  description: "Sort donated coats by size and hang them on racks for the giveaway.",
  category: "events",
  volunteersNeeded: 3,
  scheduleType: "one_time",
  timezone: "America/New_York",
  durationMinutes: 120,
  mode: "in-person",
  publicArea: "Astoria, Queens, NY"
};

export async function orgRequest(email: string, slug: string, extra: Record<string, unknown> = {}) {
  const r = await (await as(email)).post("/v1/requests", { as: "org", orgSlug: slug, title: uniq("Pilot shift"), startsAt: soon(5), ...FIELDS, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return String(r.body.id);
}

export async function publish(email: string, id: string) {
  return (await as(email)).post(`/v1/requests/${id}/transition`, { event: "publish" });
}

/** A published org request with one accepted volunteer. */
export async function staffed(o: Awaited<ReturnType<typeof makeOrg>>, extra: Record<string, unknown> = {}, volunteer?: string) {
  const id = await orgRequest(o.admin, o.slug, extra);
  expect((await publish(o.admin, id)).status).toBe(200);
  const v = volunteer ?? uniq("vol") + "@thankyou.test";
  if (!volunteer) await createUser({ email: v, roles: ["volunteer"] });
  const ap = await (await as(v)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "Happy to help", ...(extra.targetValue ? { offeredAmount: 5 } : {}) });
  expect(ap.status, JSON.stringify(ap.body)).toBe(201);
  const acc = await (await as(o.admin)).post(`/v1/requests/${id}/applicants/${ap.body.applicationId}`, { action: "accept" });
  expect(acc.status, JSON.stringify(acc.body)).toBe(200);
  return { id, volunteer: v, appId: String(ap.body.applicationId) };
}

