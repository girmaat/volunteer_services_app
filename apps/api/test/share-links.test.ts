import { describe, expect, it } from "vitest";
import { anon, as, EMAILS, pool, userId } from "./helpers";

describe("share links", () => {
  it("the button on a shared page goes to the thing shared, never back to the share page", async () => {
    const olivia = await as(EMAILS.orgAdmin);
    const org = await olivia.post("/v1/shares", { share_type: "ORGANIZATION", target_ref: "harbor-food-bank", visibility: "public" });
    expect(org.status, JSON.stringify(org.body)).toBe(200);
    const p = await anon().get(`/v1/shares/${org.body.token}`);
    expect(p.body.cta_href).toBe("/organizations/harbor-food-bank");
    expect(p.body.share_type).toBe("ORGANIZATION");

    const req = (await pool.query("SELECT id, public_area FROM service_requests WHERE requester_org_slug = 'harbor-food-bank' AND mode = 'in-person' AND status = 'open' LIMIT 1")).rows[0];
    const opp = await olivia.post("/v1/shares", { share_type: "OPPORTUNITY", target_ref: req.id, visibility: "public" });
    const op = await (await as(EMAILS.volunteer)).get(`/v1/shares/${opp.body.token}`);
    expect(op.body.cta_href).toBe(`/opportunities/${req.id}`);
    expect(op.body.coarse_location).toBe(req.public_area);
  });

  it("invite links send people to sign up", async () => {
    const v = await as(EMAILS.volunteer);
    const inv = await v.post("/v1/shares", { share_type: "INVITE", target_ref: await userId(EMAILS.volunteer), visibility: "public" });
    expect(inv.status).toBe(200);
    const p = await anon().get(`/v1/shares/${inv.body.token}`);
    expect(p.body.cta_href).toBe("/signup");
    expect(p.body.title).toMatch(/invited/);
  });
});
