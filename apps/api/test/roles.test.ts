import { describe, expect, it } from "vitest";
import { can, effectiveLegacyRole, availableContexts, type PolicyUser } from "../src/lib/policy";
import { anon, as, createUser, EMAILS, PASSWORD, pool } from "./helpers";

describe("policy: can()", () => {
  const base: PolicyUser = { id: "u1", roles: [], orgs: [] };
  it("member roles", () => {
    expect(can({ ...base, roles: ["volunteer"] }, "volunteer:act")).toBe(true);
    expect(can({ ...base, roles: ["volunteer"] }, "requester:act")).toBe(false);
    expect(can({ ...base, roles: ["volunteer", "requester"] }, "requester:act")).toBe(true);
    expect(can(null, "volunteer:act")).toBe(false);
  });
  it("org roles", () => {
    const u = { ...base, orgs: [{ slug: "a", name: "A", role: "member" as const }, { slug: "b", name: "B", role: "admin" as const }] };
    expect(can(u, "org:act")).toBe(true);
    expect(can(u, "org:admin", { orgSlug: "a" })).toBe(false);
    expect(can(u, "org:admin", { orgSlug: "b" })).toBe(true);
    expect(can({ ...u, active_context: "org:b" }, "org:manage")).toBe(true);
    expect(can({ ...u, active_context: "org:a" }, "org:manage")).toBe(false);
    expect(can(base, "org:act")).toBe(false);
  });
  it("platform roles are ranked", () => {
    expect(can({ ...base, platform_role: "moderator" }, "platform:moderate")).toBe(true);
    expect(can({ ...base, platform_role: "moderator" }, "platform:admin")).toBe(false);
    expect(can({ ...base, platform_role: "admin" }, "platform:admin")).toBe(true);
    expect(can({ ...base, platform_role: "admin" }, "platform:super")).toBe(false);
    expect(can({ ...base, platform_role: "super" }, "platform:super")).toBe(true);
  });
  it("effective legacy role follows the active context", () => {
    const dual = { ...base, role: "volunteer", roles: ["volunteer", "requester"] };
    expect(effectiveLegacyRole(dual)).toBe("volunteer");
    expect(effectiveLegacyRole({ ...dual, active_context: "requester" })).toBe("requester");
    expect(effectiveLegacyRole({ ...dual, active_context: "org:nope" })).toBe("volunteer");
    expect(availableContexts({ ...dual, orgs: [{ slug: "x", name: "X", role: "member" }], platform_role: "moderator" })).toEqual(["volunteer", "requester", "org:x", "admin"]);
  });
});

describe("one account, multiple roles", () => {
  it("the dual-role persona can use volunteer and requester areas", async () => {
    const api = await as(EMAILS.dual);
    const me = await api.get("/v1/me");
    expect(me.body.user.roles).toEqual(["requester", "volunteer"]);
    expect(me.body.user.contexts).toEqual(["volunteer", "requester"]);
    expect((await api.get("/v1/volunteer/applications")).status).toBe(200);
    expect((await api.get("/v1/requester/requests")).status).toBe(200);
  });

  it("single-role accounts are kept out of the other area", async () => {
    expect((await (await as(EMAILS.volunteer)).get("/v1/requester/requests")).status).toBe(403);
    expect((await (await as(EMAILS.requester)).get("/v1/volunteer/applications")).status).toBe(403);
  });

  it("switches context only to contexts the user has", async () => {
    const api = await as(EMAILS.dual);
    expect((await api.post("/v1/me/context", { context: "org:harbor-food-bank" })).status).toBe(403);
    expect((await api.post("/v1/me/context", { context: "admin" })).status).toBe(403);
    expect((await api.post("/v1/me/context", { context: "bogus" })).status).toBe(403);
    const ok = await api.post("/v1/me/context", { context: "requester" });
    expect(ok.status).toBe(200);
    expect(ok.body.home).toBe("/requester/dashboard");
    const me = await api.get("/v1/me");
    expect(me.body.user.active_context).toBe("requester");
    expect(me.body.user.role).toBe("requester");
    await api.post("/v1/me/context", { context: "volunteer" });
  });

  it("context is per session", async () => {
    const login = await anon().post("/v1/auth/login").send({ email: EMAILS.dual, password: PASSWORD });
    const other = login.body.sessionToken as string;
    const api = await as(EMAILS.dual);
    await api.post("/v1/me/context", { context: "requester" });
    const me2 = await anon().get("/v1/me").set("authorization", `Bearer ${other}`);
    expect(me2.body.user.active_context).not.toBe("requester");
    await api.post("/v1/me/context", { context: "volunteer" });
  });

  it("adds a role to an existing account", async () => {
    await createUser({ email: "add.role@thankyou.test", roles: ["volunteer"] });
    const api = await as("add.role@thankyou.test");
    expect((await api.get("/v1/requester/requests")).status).toBe(403);
    const add = await api.post("/v1/me/roles", { role: "requester" });
    expect(add.status).toBe(201);
    expect(add.body.next).toBe("/requester/profile?setup=1");
    expect((await api.get("/v1/requester/requests")).status).toBe(200);
    expect((await api.get("/v1/volunteer/applications")).status).toBe(200);
    const again = await api.post("/v1/me/roles", { role: "requester" });
    expect(again.status).toBe(200);
    expect(again.body.added).toBe(false);
    expect((await api.post("/v1/me/roles", { role: "org_admin" })).status).toBe(400);
  });

  it("an org team member who also volunteers can use both", async () => {
    await createUser({ email: "org.vol@thankyou.test", roles: ["volunteer"], org: { slug: "harbor-food-bank", role: "member" } });
    const api = await as("org.vol@thankyou.test");
    expect((await api.get("/v1/org/me")).status).toBe(200);
    expect((await api.get("/v1/volunteer/applications")).status).toBe(200);
    const me = await api.get("/v1/me");
    expect(me.body.user.contexts).toEqual(["volunteer", "org:harbor-food-bank"]);
  });

  it("the org admin persona picks the org from the session context", async () => {
    const api = await as(EMAILS.orgAdmin);
    const me = await api.get("/v1/me");
    const orgs = me.body.user.orgs.map((o: { slug: string }) => o.slug).sort();
    expect(orgs).toEqual(["bright-futures-tutoring", "harbor-food-bank"]);
    await api.post("/v1/me/context", { context: "org:bright-futures-tutoring" });
    expect((await api.get("/v1/org/me")).body.org.slug).toBe("bright-futures-tutoring");
    await api.post("/v1/me/context", { context: "org:harbor-food-bank" });
    expect((await api.get("/v1/org/me")).body.org.slug).toBe("harbor-food-bank");
  });

  it("moderators are platform moderators but not admins", async () => {
    const api = await as(EMAILS.moderator);
    const me = await api.get("/v1/me");
    expect(me.body.user.platform_role).toBe("moderator");
    expect(me.body.user.is_platform_admin).toBe(false);
    expect(me.body.user.contexts).toContain("admin");
  });
});

describe("org onboarding", () => {
  it("finishing org onboarding finishes the admin's account onboarding too", async () => {
    await pool.query("INSERT INTO organizations (slug, name, summary, location, contact_email, onboarding_completed) VALUES ('onb-test-org', 'Onboarding Test Org', 'A test organization summary.', 'Queens, NY', 'onb@example.org', FALSE) ON CONFLICT DO NOTHING");
    const id = await createUser({ email: "onb.admin@thankyou.test", org: { slug: "onb-test-org", role: "admin" } });
    await pool.query("UPDATE users SET onboarding_completed = FALSE, profile_completed = FALSE WHERE id = $1", [id]);
    await pool.query("UPDATE user_profiles SET full_name = 'Onb Admin', phone = '718-555-0101' WHERE user_id = $1", [id]);
    const a = await as("onb.admin@thankyou.test");
    expect((await a.post("/v1/requests", { as: "org", title: "x" })).status).toBe(403);
    const r = await a.patch("/v1/orgs/onb-test-org", { onboarding_completed: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const u = await pool.query("SELECT onboarding_completed FROM users WHERE id = $1", [id]);
    expect(u.rows[0].onboarding_completed).toBe(true);
  });
});

describe("organization sign-up", () => {
  it("generates a unique address from the name and defaults the contact email", async () => {
    const body = (n: number) => ({
      org: { name: "Riverside Mutual Aid", summary: "Neighbors helping neighbors along the river.", location: "Astoria, NY" },
      admin: { fullName: "Riley Admin", email: `riley.${n}@example.org`, password: "Long-Enough-123!", adultConfirmed: true as const }
    });
    // Staff confirm they're adults (they don't give a birth date).
    const noAttest = await anon().post("/v1/orgs/enroll").send({ ...body(9), admin: { ...body(9).admin, adultConfirmed: undefined } });
    expect(noAttest.status).toBe(400);
    const a = await anon().post("/v1/orgs/enroll").send(body(1));
    expect(a.status, JSON.stringify(a.body)).toBe(202);
    const b = await anon().post("/v1/orgs/enroll").send(body(2));
    expect(a.body.org.slug).toBe("riverside-mutual-aid");
    expect(b.body.org.slug).toBe("riverside-mutual-aid-2");
    const org = await pool.query("SELECT contact_email FROM organizations WHERE slug = 'riverside-mutual-aid'");
    expect(org.rows[0].contact_email).toBe("riley.1@example.org");
    // Org-only accounts aren't held at a personal verification step.
    const u = await pool.query("SELECT onboarding_completed, verification_required, adult_attested_at FROM users WHERE email = 'riley.1@example.org'");
    expect(u.rows[0]).toMatchObject({ onboarding_completed: true, verification_required: false });
    expect(u.rows[0].adult_attested_at).toBeTruthy();
    // New organizations start unverified: they can't publish until ThankYou verifies them.
    const o = await pool.query("SELECT verification_status FROM organizations WHERE slug = 'riverside-mutual-aid'");
    expect(o.rows[0].verification_status).toBe("required");
  });

  it("a volunteer can start an organization and keeps volunteering", async () => {
    await createUser({ email: "vol.founder@thankyou.test", roles: ["volunteer"] });
    const v = await as("vol.founder@thankyou.test");
    const r = await v.post("/v1/orgs/create", { org: { name: "Founder Food Share", summary: "A small food share run by neighbors.", location: "Queens, NY" } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const me = await v.get("/v1/me");
    expect(me.body.user.roles).toContain("volunteer");
    expect(me.body.user.orgs.map((o: { slug: string }) => o.slug)).toContain(r.body.org.slug);
    expect(me.body.user.active_context).toBe(`org:${r.body.org.slug}`);
  });
});
