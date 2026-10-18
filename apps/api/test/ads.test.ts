import { describe, expect, it } from "vitest";
import { anon, as, EMAILS, pool, tokenFor } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const titles = async (side: "left" | "right") => ((await anon().get("/v1/public/ads")).body[side] as { title: string }[]).map((a) => a.title);

describe("advertisement panels", () => {
  it("shows only live ads on switched-on sides", async () => {
    const admin = await as(EMAILS.admin);
    const day = 86400_000;
    const mk = async (title: string, extra: Record<string, unknown> = {}) =>
      (await admin.post("/v1/admin/ads", { title, body: "Body text", link_url: "/opportunities", placement: "left", ...extra })).body.id as string;
    const live = await mk("Ad live");
    await mk("Ad off", { is_active: false });
    await mk("Ad expired", { expires_at: new Date(Date.now() - day).toISOString() });
    await mk("Ad later", { starts_at: new Date(Date.now() + day).toISOString() });
    await mk("Ad right", { placement: "right" });

    await admin.post("/v1/admin/ads/settings", { left: false, right: false });
    expect(await titles("left")).toEqual([]);
    await admin.post("/v1/admin/ads/settings", { left: true, right: false });
    const left = await titles("left");
    expect(left).toContain("Ad live");
    expect(left).not.toContain("Ad off");
    expect(left).not.toContain("Ad expired");
    expect(left).not.toContain("Ad later");
    expect(await titles("right")).toEqual([]);
    await admin.post("/v1/admin/ads/settings", { left: true, right: true });
    expect(await titles("right")).toContain("Ad right");

    // Turning one ad off hides it straight away.
    expect((await admin.patch(`/v1/admin/ads/${live}`, { is_active: false })).status).toBe(200);
    expect(await titles("left")).not.toContain("Ad live");
    await admin.post("/v1/admin/ads/settings", { left: false, right: false });
  });

  it("validates links and dates, and only platform admins manage ads", async () => {
    const admin = await as(EMAILS.admin);
    expect((await admin.post("/v1/admin/ads", { title: "Bad link", link_url: "javascript:alert(1)", placement: "left" })).status).toBe(400);
    expect((await admin.post("/v1/admin/ads", { title: "Bad dates", placement: "left", starts_at: "2030-01-02T00:00:00Z", expires_at: "2030-01-01T00:00:00Z" })).status).toBe(400);
    for (const who of [EMAILS.moderator, EMAILS.orgAdmin, EMAILS.volunteer]) {
      const u = await as(who);
      expect([403, 404]).toContain((await u.get("/v1/admin/ads")).status);
      expect([403, 404]).toContain((await u.post("/v1/admin/ads", { title: "Nope", placement: "left" })).status);
      expect([403, 404]).toContain((await u.post("/v1/admin/ads/settings", { left: true, right: true })).status);
    }
    expect((await anon().post("/v1/admin/ads/settings").send({ left: true, right: true })).status).toBe(401);
  });

  it("uploads an ad image served from this site, and deleting the ad removes it", async () => {
    const admin = await as(EMAILS.admin);
    const id = (await admin.post("/v1/admin/ads", { title: "With image", placement: "right" })).body.id;
    const up = await anon().post(`/v1/admin/ads/${id}/image`).set("authorization", `Bearer ${await tokenFor(EMAILS.admin)}`).attach("file", PNG, "ad.png");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.image_url).toMatch(/^\/media\/[0-9a-f-]{36}$/);
    expect((await anon().get(`/v1/public${up.body.image_url}`)).status).toBe(200);
    expect((await admin.del(`/v1/admin/ads/${id}`)).status).toBe(200);
    expect((await pool.query("SELECT 1 FROM media_images WHERE '/media/' || id::text = $1", [up.body.image_url])).rowCount).toBe(0);
  });
});
