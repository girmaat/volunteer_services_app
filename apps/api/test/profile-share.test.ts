import { describe, expect, it } from "vitest";
import { anon, as, birthDateForAge, createUser, EMAILS, pool, userId } from "./helpers";

const tokenOf = (url: string) => url.split("/p/")[1]!;

describe("private volunteer profiles and share links", () => {
  it("profiles are private; a share link shows accomplishments and the chosen details", async () => {
    const id = await userId(EMAILS.volunteer);
    expect((await anon().get(`/v1/public/volunteers/${id}`)).status).toBe(404);
    expect((await (await as(EMAILS.requester)).get(`/v1/public/volunteers/${id}`)).status).toBe(404);
    expect((await (await as(EMAILS.volunteer)).get(`/v1/public/volunteers/${id}`)).status).toBe(200);

    const v = await as(EMAILS.volunteer);
    await pool.query("UPDATE user_profiles SET bio = 'I like long walks.', public_location = 'Hoboken, NJ' WHERE user_id = $1", [id]);
    const start = await v.get("/v1/volunteer/profile-share");
    expect(start.body.link).toBeNull();
    expect(start.body.settings).toMatchObject({ show_name: true, show_about: false, show_total_hours: true });

    const made = await v.post("/v1/volunteer/profile-share");
    expect(made.status).toBe(201);
    const t1 = tokenOf(made.body.link.url);
    let pub = await anon().get(`/v1/public/profile-shares/${t1}`);
    expect(pub.status).toBe(200);
    expect(pub.body.name).toBeTruthy();
    expect(pub.body.about).toBeNull();
    expect(pub.body.location).toBeNull();
    expect(Array.isArray(pub.body.accomplishments)).toBe(true);
    expect(JSON.stringify(pub.body)).not.toMatch(/@volunteer-services-app\.test/);

    // Switch details on and off.
    await v.put("/v1/volunteer/profile-share/settings", { show_name: false, show_about: true, show_location: true, show_total_hours: false, show_average_rating: true, show_reviews_count: true });
    pub = await anon().get(`/v1/public/profile-shares/${t1}`);
    expect(pub.body.name).toBeNull();
    expect(pub.body.about).toBe("I like long walks.");
    expect(pub.body.location).toBe("Hoboken, NJ");
    expect(pub.body.total_hours).toBeNull();
    expect(typeof pub.body.reviews_count).toBe("number");

    // A new link replaces the old one; revoking stops the new one too.
    const t2 = tokenOf((await v.post("/v1/volunteer/profile-share")).body.link.url);
    expect(t2).not.toBe(t1);
    expect((await anon().get(`/v1/public/profile-shares/${t1}`)).status).toBe(404);
    expect((await anon().get(`/v1/public/profile-shares/${t2}`)).status).toBe(200);
    expect((await v.post("/v1/volunteer/profile-share/revoke")).body.revoked).toBe(true);
    expect((await anon().get(`/v1/public/profile-shares/${t2}`)).status).toBe(404);
    expect((await v.get("/v1/volunteer/profile-share")).body.link).toBeNull();
    await v.put("/v1/volunteer/profile-share/settings", { show_name: true, show_about: false, show_location: false, show_total_hours: true, show_average_rating: false, show_reviews_count: false });
  });

  it("volunteers under 18 can't share their profile", async () => {
    const teen = `share.teen.${Date.now()}@volunteer-services-app.test`;
    await createUser({ email: teen, roles: ["volunteer"], birthDate: birthDateForAge(16) });
    const t = await as(teen);
    expect((await t.get("/v1/volunteer/profile-share")).body.can_share).toBe(false);
    expect((await t.post("/v1/volunteer/profile-share")).status).toBe(403);
  });

  it("dashboard shows total approved hours", async () => {
    const d = await (await as(EMAILS.volunteer)).get("/v1/volunteer/dashboard");
    expect(typeof d.body.hoursLogged).toBe("number");
  });
});
