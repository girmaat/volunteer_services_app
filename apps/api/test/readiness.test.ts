/**
 * Release-2 readiness (typed requests and contributions, organization types and coordinators,
 * contribution evidence) and contact-detail limits for organization members.
 */
import { describe, expect, it } from "vitest";
import { anon, as, createUser, EMAILS, pool, tokenFor } from "./helpers";

const upload = async (email: string, path: string, buf: Buffer, name: string) =>
  anon().post(path).set("authorization", `Bearer ${await tokenFor(email)}`).attach("file", buf, name);

const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

describe("typed requests (work_type)", () => {
  it("a goal counted in something other than hours makes a 'units' request; hours make a 'shift'", async () => {
    const api = await as(EMAILS.requester);
    const created = await api.post("/v1/requests", {
      title: "Readiness: pack meal kits",
      description: "Pack meal kits for families at the community center.",
      category: "food",
      volunteersNeeded: 3,
      mode: "remote",
      targetValue: 200,
      targetUnit: "meals"
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id;
    expect((await api.get(`/v1/requests/${id}`)).body.work_type).toBe("units");
    await api.patch(`/v1/requests/${id}`, { targetValue: 10, targetUnit: "hours" });
    expect((await api.get(`/v1/requests/${id}`)).body.work_type).toBe("shift");
    // Reserved types aren't set by release-1 edits.
    await pool.query("UPDATE service_requests SET work_type = 'goods' WHERE id = $1", [id]);
    await api.patch(`/v1/requests/${id}`, { targetUnit: "boxes" });
    expect((await api.get(`/v1/requests/${id}`)).body.work_type).toBe("goods");
  });
});

describe("typed contributions (kind)", () => {
  it("hours make a 'time' contribution, units alone make a 'units' one, and goods never carry hours", async () => {
    const vol = await as(EMAILS.volunteer);
    const t = await vol.post("/v1/volunteer/contributions", { hours: 2, description: "Readiness: sorted donations" });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    const u = await vol.post("/v1/volunteer/contributions", { units: 40, description: "Readiness: knitted hats" });
    expect(u.status, JSON.stringify(u.body)).toBe(201);
    const kinds = await pool.query("SELECT id, kind FROM contributions WHERE id = ANY($1::uuid[])", [[t.body.id, u.body.id]]);
    const byId = Object.fromEntries(kinds.rows.map((r) => [String(r.id), r.kind]));
    expect(byId[t.body.id]).toBe("time");
    expect(byId[u.body.id]).toBe("units");
    await expect(pool.query("UPDATE contributions SET kind = 'goods' WHERE id = $1", [t.body.id])).rejects.toThrow(/contributions_goods_no_hours/);
  });
});

describe("organization types and coordinators", () => {
  it("only a school can have coordinators, and its admin sets the type", async () => {
    const admin = await as(EMAILS.orgAdmin);
    const slug = (await admin.get("/v1/org/me")).body.org.slug as string;
    const member = await as(EMAILS.orgMember);
    expect((await member.patch(`/v1/orgs/${slug}`, { org_type: "school" })).status).toBe(403);

    const email = `coord.${Date.now()}@thankyou.test`;
    expect((await admin.post("/v1/org/members", { email, role: "coordinator" })).status).toBe(400);
    expect((await admin.patch(`/v1/orgs/${slug}`, { org_type: "spaceship" })).status).toBe(400);

    const school = await admin.patch(`/v1/orgs/${slug}`, { org_type: "school" });
    expect(school.status, JSON.stringify(school.body)).toBe(200);
    expect(school.body.org.org_type).toBe("school");
    const invited = await admin.post("/v1/org/members", { email, role: "coordinator" });
    expect([200, 201], JSON.stringify(invited.body)).toContain(invited.status);

    // Can't stop being a school while coordinators remain.
    expect((await admin.patch(`/v1/orgs/${slug}`, { org_type: "nonprofit" })).status).toBe(409);
    await pool.query("DELETE FROM organization_members WHERE org_slug = $1 AND role = 'coordinator'", [slug]);
    expect((await admin.patch(`/v1/orgs/${slug}`, { org_type: "nonprofit" })).status).toBe(200);
  });

  it("a coordinator has member-level access: they see the org but can't manage it", async () => {
    const admin = await as(EMAILS.orgAdmin);
    const slug = (await admin.get("/v1/org/me")).body.org.slug as string;
    const email = `coord.active.${Date.now()}@thankyou.test`;
    const id = await createUser({ email, org: { slug, role: "member" } });
    await pool.query("UPDATE organization_members SET role = 'coordinator' WHERE org_slug = $1 AND user_id = $2", [slug, id]);
    try {
      const c = await as(email);
      const me = await c.get("/v1/org/me");
      expect(me.status).toBe(200);
      expect(me.body.membership.role).toBe("coordinator");
      expect((await c.get("/v1/org/roster")).status).toBe(403);
      expect((await c.post("/v1/org/members", { email: "x@thankyou.test" })).status).toBe(403);
    } finally {
      await pool.query("DELETE FROM organization_members WHERE org_slug = $1 AND user_id = $2", [slug, id]);
    }
  });

  it("platform admins see and can set the type", async () => {
    const api = await as(EMAILS.admin);
    const list = await api.get("/v1/admin/organizations?limit=5");
    expect(list.body.organizations[0]).toHaveProperty("org_type");
    const slug = list.body.organizations[0].slug;
    const before = list.body.organizations[0].org_type;
    expect((await api.patch(`/v1/admin/organizations/${slug}`, { org_type: "community_group" })).status).toBe(200);
    expect((await api.patch(`/v1/admin/organizations/${slug}`, { org_type: before })).status).toBe(200);
  });
});

describe("contribution evidence", () => {
  it("the volunteer adds a link and a file, reads them back, and removes their own", async () => {
    const vol = await as(EMAILS.volunteer);
    const c = await vol.post("/v1/volunteer/contributions", { hours: 1.5, description: "Readiness: evidence test" });
    const id = c.body.id;

    expect((await vol.post(`/v1/contributions/${id}/evidence`, { url: "javascript:alert(1)" })).status).toBe(400);
    const link = await vol.post(`/v1/contributions/${id}/evidence`, { url: "https://example.org/photos", label: "Photos" });
    expect(link.status, JSON.stringify(link.body)).toBe(201);

    const file = await upload(EMAILS.volunteer, `/v1/contributions/${id}/evidence/file`, PNG, "receipt.png");
    expect(file.status, JSON.stringify(file.body)).toBe(201);
    const bad = await upload(EMAILS.volunteer, `/v1/contributions/${id}/evidence/file`, Buffer.from("<script>"), "x.html");
    expect(bad.status).toBe(422);

    const list = await vol.get(`/v1/contributions/${id}/evidence`);
    expect(list.status).toBe(200);
    expect(list.body.evidence.map((e: { kind: string }) => e.kind)).toEqual(["link", "file"]);
    expect(JSON.stringify(list.body)).not.toMatch(/"bytes"/);
    const dl = await vol.get(list.body.evidence[1].download_path);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toMatch(/image\/png/);

    // Nobody else sees it.
    const other = await as(EMAILS.remoteVolunteer);
    expect((await other.get(`/v1/contributions/${id}/evidence`)).status).toBe(404);
    expect((await other.get(list.body.evidence[1].download_path)).status).toBe(404);
    expect((await other.post(`/v1/contributions/${id}/evidence`, { url: "https://example.org/x" })).status).toBe(404);
    expect((await other.del(`/v1/contributions/${id}/evidence/${link.body.id}`)).status).toBe(404);

    expect((await vol.del(`/v1/contributions/${id}/evidence/${link.body.id}`)).status).toBe(200);
    expect((await vol.get(`/v1/contributions/${id}`)).body.evidence).toHaveLength(1);
  });

  it("an org's reviewers see a volunteer's evidence; members don't; a decided contribution is locked for the volunteer", async () => {
    const admin = await as(EMAILS.orgAdmin);
    const slug = (await admin.get("/v1/org/me")).body.org.slug as string;
    const vid = (await pool.query("SELECT id FROM users WHERE email = $1", [EMAILS.volunteer])).rows[0].id;
    const ins = await pool.query(
      "INSERT INTO contributions (volunteer_user_id, org_slug, source, reported_hours, status, verification_method, description) VALUES ($1, $2, 'volunteer_report', 2, 'pending', 'volunteer_report', 'Readiness: org evidence') RETURNING id",
      [vid, slug]
    );
    const id = String(ins.rows[0].id);
    const vol = await as(EMAILS.volunteer);
    expect((await vol.post(`/v1/contributions/${id}/evidence`, { url: "https://example.org/sign-in-sheet" })).status).toBe(201);

    const seen = await admin.get(`/v1/contributions/${id}/evidence`);
    expect(seen.status).toBe(200);
    expect(seen.body.evidence).toHaveLength(1);
    const member = await as(EMAILS.orgMember);
    expect((await member.get(`/v1/contributions/${id}/evidence`)).status).toBe(404);

    await pool.query("UPDATE contributions SET status = 'approved' WHERE id = $1", [id]);
    expect((await vol.post(`/v1/contributions/${id}/evidence`, { url: "https://example.org/late" })).status).toBe(409);
    expect((await admin.post(`/v1/contributions/${id}/evidence`, { url: "https://example.org/reviewer-note" })).status).toBe(201);
  });
});

describe("volunteer contact details are for admins and managers", () => {
  it("org members don't get emails or phones for applicants, applications, the dashboard or incidents", async () => {
    const admin = await as(EMAILS.orgAdmin);
    const member = await as(EMAILS.orgMember);
    // An adult volunteer the organization has accepted (accepted adults' contacts are shared with staff).
    const slug = (await admin.get("/v1/org/me")).body.org.slug as string;
    const opp = (await anon().get(`/v1/public/opportunities?org=${slug}&mode=remote&limit=5`)).body.items[0];
    const vEmail = `contacts.${Date.now()}@thankyou.test`;
    await createUser({ email: vEmail, roles: ["volunteer"], trusted: true });
    const applied = await (await as(vEmail)).post(`/v1/volunteer/opportunities/${opp.id}/apply`, { message: "Happy to help." });
    expect([200, 201], JSON.stringify(applied.body)).toContain(applied.status);
    const acc = await admin.patch(`/v1/org/applications/${applied.body.applicationId}`, { status: "accepted" });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);

    const adminApps = await admin.get("/v1/org/applications");
    expect(adminApps.body.applications.some((a: { volunteer_email: string | null }) => a.volunteer_email)).toBe(true);
    const memberApps = await member.get("/v1/org/applications");
    expect(memberApps.status).toBe(200);
    expect(memberApps.body.applications.length).toBe(adminApps.body.applications.length);
    expect(memberApps.body.applications.every((a: { volunteer_email: string | null }) => a.volunteer_email == null)).toBe(true);

    const withEmail = adminApps.body.applications.find((a: { volunteer_email: string | null }) => a.volunteer_email === vEmail);
    const adminApplicants = await admin.get(`/v1/requests/${withEmail.request_id}/applicants`);
    expect(adminApplicants.body.applicants.some((a: { email: string | null }) => a.email)).toBe(true);
    const memberApplicants = await member.get(`/v1/requests/${withEmail.request_id}/applicants`);
    expect(memberApplicants.status).toBe(200);
    expect(memberApplicants.body.applicants.every((a: { email: string | null; phone: string | null }) => a.email == null && a.phone == null)).toBe(true);

    const dash = await member.get("/v1/org/dashboard");
    expect(JSON.stringify(dash.body.recentApplications)).not.toMatch(/@/);

    const incidents = await member.get("/v1/org/incidents");
    expect(incidents.status).toBe(200);
    expect(incidents.body.incidents.every((i: { volunteer_email: string | null }) => i.volunteer_email == null)).toBe(true);
    // Searching by email would reveal it, so members can't.
    const local = withEmail.volunteer_email.split("@")[0];
    const searched = await member.get(`/v1/org/incidents?search=${encodeURIComponent(local)}`);
    const adminSearched = await admin.get(`/v1/org/incidents?search=${encodeURIComponent(local)}`);
    expect(searched.body.incidents.length).toBeLessThanOrEqual(adminSearched.body.incidents.length);
  });
});
