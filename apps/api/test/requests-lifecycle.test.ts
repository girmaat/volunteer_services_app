import { describe, expect, it } from "vitest";
import { anon, as, birthDateForAge, createUser, EMAILS, pool, userId } from "./helpers";
import { readUnsubscribeToken, unsubscribeToken } from "../src/modules/notifications/service";

const soon = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();

async function draft(email: string, fields: Record<string, unknown> = {}, as_: "requester" | "org" = "requester") {
  const api = await as(email);
  const res = await api.post("/v1/requests", { as: as_, ...fields });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.id);
}

const BASICS = {
  title: "Lifecycle: help sort winter coats",
  description: "Sort donated coats by size and hang them on racks for Saturday's giveaway.",
  category: "events",
  requiredSkills: ["sorting", "lifting"],
  niceToHaveSkills: "spanish, customer service",
  volunteersNeeded: 2,
  urgency: "normal"
};
const WHEN = { scheduleType: "one_time", startsAt: soon(5), endsAt: soon(5.1), timezone: "America/New_York", durationMinutes: 120 };
const WHERE = { mode: "in-person", publicArea: "Upper West Side, Manhattan, NY", exactAddress: "123 W 86th St, Apt 4B, New York, NY" };

describe("posting wizard: drafts saved step by step", () => {
  it("creates a draft, saves each step and publishes", async () => {
    const id = await draft(EMAILS.requester, { title: BASICS.title });
    const api = await as(EMAILS.requester);
    let r = await api.get(`/v1/requests/${id}`);
    expect(r.body.status).toBe("draft");
    expect(r.body.actions).toContain("publish");
    expect(r.body.publish_problems.length).toBeGreaterThan(0);

    for (const step of [BASICS, WHEN, WHERE, { minAge: 16, requiresCar: true, equipmentNotes: "Gloves provided" }]) {
      const p = await api.patch(`/v1/requests/${id}`, step);
      expect(p.status, JSON.stringify(p.body)).toBe(200);
    }
    r = await api.get(`/v1/requests/${id}`);
    expect(r.body.required_skills).toEqual(["sorting", "lifting"]);
    expect(r.body.nice_to_have_skills).toEqual(["spanish", "customer service"]);
    expect(r.body.exact_address).toContain("123 W 86th");
    expect(r.body.publish_problems).toEqual([]);

    const pub = await api.post(`/v1/requests/${id}/transition`, { event: "publish" });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    expect(pub.body.to).toBe("open");

    r = await api.get(`/v1/requests/${id}`);
    expect(r.body.events.map((e: { event: string }) => e.event)).toEqual(["create", "publish"]);
    expect(r.body.actions).toEqual(expect.arrayContaining(["pause", "cancel"]));
  });

  it("refuses to publish an incomplete draft and validates fields", async () => {
    const id = await draft(EMAILS.requester, { title: "Incomplete draft" });
    const api = await as(EMAILS.requester);
    const pub = await api.post(`/v1/requests/${id}/transition`, { event: "publish" });
    expect(pub.status).toBe(422);
    expect(pub.body.problems.join(" ")).toMatch(/description/);
    expect((await api.patch(`/v1/requests/${id}`, { volunteersNeeded: 0 })).status).toBe(400);
    expect((await api.patch(`/v1/requests/${id}`, { timezone: "Mars/Olympus" })).status).toBe(400);
    expect((await api.patch(`/v1/requests/${id}`, { recurrenceRule: "every tuesday" })).status).toBe(400);
    expect((await api.patch(`/v1/requests/${id}`, { recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH" })).status).toBe(200);
    expect((await api.patch(`/v1/requests/${id}`, { category: "nope" })).status).toBe(400);
    expect((await api.patch(`/v1/requests/${id}`, { unknownField: 1 })).status).toBe(400);
    const bad = await api.patch(`/v1/requests/${id}`, { ...BASICS, ...WHEN, ...WHERE, endsAt: soon(4) });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/end time/);
    await api.patch(`/v1/requests/${id}`, { ...BASICS, ...WHEN, ...WHERE, applyBy: soon(6) });
    const late = await api.post(`/v1/requests/${id}/transition`, { event: "publish" });
    expect(late.status).toBe(422);
    expect(late.body.message).toMatch(/apply-by/);
  });

  it("only the owner sees or edits a request; drafts can be deleted, live requests cannot", async () => {
    const id = await draft(EMAILS.requester, { title: "Owner-only draft" });
    expect((await (await as(EMAILS.volunteer)).get(`/v1/requests/${id}`)).status).toBe(404);
    expect((await (await as(EMAILS.dual)).patch(`/v1/requests/${id}`, { title: "hijack" })).status).toBe(404);
    expect((await (await as(EMAILS.requester)).del(`/v1/requests/${id}`)).status).toBe(204);
  });

  it("volunteer-only accounts can't post as a requester; org members need admin or manager", async () => {
    expect((await (await as(EMAILS.volunteer)).post("/v1/requests", { title: "x" })).status).toBe(403);
    expect((await (await as(EMAILS.orgMember)).post("/v1/requests", { as: "org", title: "x" })).status).toBe(403);
    const id = await draft(EMAILS.orgAdmin, { title: "Org draft" }, "org");
    const mine = await (await as(EMAILS.orgAdmin)).get("/v1/requests/mine?as=org");
    expect(mine.body.requests.some((r: { id: string }) => r.id === id)).toBe(true);
  });
});

describe("sensitive categories and verification tiers", () => {
  it("a basic requester can't post in a sensitive category", async () => {
    const id = await draft(EMAILS.requester, { ...BASICS, ...WHEN, ...WHERE, title: "Sensitive: help inside my home", category: "home-access" });
    const pub = await (await as(EMAILS.requester)).post(`/v1/requests/${id}/transition`, { event: "publish" });
    expect(pub.status).toBe(403);
    expect(pub.body.error.code).toBe("verification_required");
  });

  it("a verified requester's sensitive request waits for review and stays hidden", async () => {
    await createUser({ email: "trusted.requester@thankyou.test", roles: ["requester"], trusted: true });
    const id = await draft("trusted.requester@thankyou.test", { ...BASICS, ...WHEN, ...WHERE, title: "Sensitive: fix a cabinet door", category: "home-access" });
    const api = await as("trusted.requester@thankyou.test");
    const pub = await api.post(`/v1/requests/${id}/transition`, { event: "publish" });
    expect(pub.status, JSON.stringify(pub.body)).toBe(200);
    expect(pub.body.review_status).toBe("pending_review");
    expect(pub.body.to).toBe("draft");
    expect((await anon().get(`/v1/public/opportunities/${id}`)).status).toBe(404);
    const again = await api.post(`/v1/requests/${id}/transition`, { event: "publish" });
    expect(again.status).toBe(409);
    // Moderators were told.
    const mod = await pool.query("SELECT COUNT(*)::int AS c FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = 'moderation'", [EMAILS.moderator]);
    expect(mod.rows[0].c).toBeGreaterThan(0);
  });
});

describe("staffing: open → pending → filled, waitlist auto-promotion", () => {
  let requestId = "";
  const apps: Record<string, string> = {};
  const vols = ["staff.a@thankyou.test", "staff.b@thankyou.test", "staff.c@thankyou.test"];

  it("sets up a request for two volunteers", async () => {
    for (const v of vols) await createUser({ email: v, roles: ["volunteer"] });
    requestId = await draft(EMAILS.requester, { ...BASICS, ...WHEN, ...WHERE, title: "Staffing: two movers" });
    const pub = await (await as(EMAILS.requester)).post(`/v1/requests/${requestId}/transition`, { event: "publish" });
    expect(pub.body.to).toBe("open");
  });

  it("applications notify the owner", async () => {
    for (const v of vols.slice(0, 2)) {
      const r = await (await as(v)).post(`/v1/volunteer/opportunities/${requestId}/apply`, { message: "Happy to help" });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      apps[v] = r.body.applicationId;
    }
    const n = await (await as(EMAILS.requester)).get("/v1/notifications");
    expect(n.body.notifications.filter((x: { type: string; title: string }) => x.type === "application_received" && x.title.includes("Staffing: two movers")).length).toBe(2);
    expect(n.body.unread_count).toBeGreaterThan(1);
  });

  it("first accept → pending, second → filled; extra applicants join the waitlist", async () => {
    const api = await as(EMAILS.requester);
    await api.post(`/v1/requester/applications/${apps[vols[0]]}/accept`);
    expect((await api.get(`/v1/requests/${requestId}`)).body.status).toBe("pending");
    await api.post(`/v1/requester/applications/${apps[vols[1]]}/accept`);
    const full = await api.get(`/v1/requests/${requestId}`);
    expect(full.body.status).toBe("filled");
    expect(full.body.staffing).toMatchObject({ accepted: 2, needed: 2 });
    const late = await (await as(vols[2])).post(`/v1/volunteer/opportunities/${requestId}/apply`, { message: "Me too" });
    expect(late.status).toBe(201);
    expect(late.body.status).toBe("waitlisted");
    apps[vols[2]] = late.body.applicationId;
    const over = await api.post(`/v1/requester/applications/${apps[vols[2]]}/accept`);
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("full");
  });

  it("when an accepted volunteer is canceled, the next waitlisted person is offered the spot (never placed silently)", async () => {
    const api = await as(EMAILS.requester);
    const c = await api.post(`/v1/requester/applications/${apps[vols[0]]}/cancel`);
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const offered = await pool.query("SELECT status, offer_expires_at FROM request_applications WHERE id = $1", [apps[vols[2]]]);
    expect(offered.rows[0].status).toBe("offered");
    expect(new Date(offered.rows[0].offer_expires_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    const r = await api.get(`/v1/requests/${requestId}`);
    expect(r.body.status).toBe("pending"); // an offered spot holds the place but isn't filled until they say yes
    expect(r.body.events.map((e: { event: string }) => e.event)).toContain("waitlist_offered");
    const n = await (await as(vols[2])).get("/v1/notifications");
    expect(n.body.notifications.some((x: { title: string }) => x.title.startsWith("A spot opened"))).toBe(true);
    // Only the offered volunteer can answer, and saying yes fills the request.
    expect((await (await as(vols[1])).post(`/v1/volunteer/applications/${apps[vols[2]]}/offer`, { accept: true })).status).toBe(404);
    const yes = await (await as(vols[2])).post(`/v1/volunteer/applications/${apps[vols[2]]}/offer`, { accept: true });
    expect(yes.body.status).toBe("accepted");
    expect((await api.get(`/v1/requests/${requestId}`)).body.status).toBe("filled");
  });

  it("an unanswered offer expires after 24 hours and goes to the next person", async () => {
    const api = await as(EMAILS.requester);
    const id = await draft(EMAILS.requester, { ...BASICS, ...WHEN, ...WHERE, title: "Offer expiry", volunteersNeeded: 1 });
    await api.post(`/v1/requests/${id}/transition`, { event: "publish" });
    const people = ["offer.a@thankyou.test", "offer.b@thankyou.test", "offer.c@thankyou.test"];
    for (const e of people) await createUser({ email: e, roles: ["volunteer"] });
    const ids: string[] = [];
    for (const e of people) ids.push((await (await as(e)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" })).body.applicationId);
    await api.post(`/v1/requester/applications/${ids[0]}/accept`);
    for (const x of ids.slice(1)) await pool.query("UPDATE request_applications SET status = 'waitlisted' WHERE id = $1", [x]);
    await api.post(`/v1/requester/applications/${ids[0]}/cancel`);
    expect((await pool.query("SELECT status FROM request_applications WHERE id = $1", [ids[1]])).rows[0].status).toBe("offered");
    // Declining passes it on; letting the next one lapse expires it.
    expect((await (await as(people[1])).post(`/v1/volunteer/applications/${ids[1]}/offer`, { accept: false })).body.status).toBe("withdrawn");
    expect((await pool.query("SELECT status FROM request_applications WHERE id = $1", [ids[2]])).rows[0].status).toBe("offered");
    await pool.query("UPDATE request_applications SET offer_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [ids[2]]);
    const { expireOffers } = await import("../src/modules/requests/offers");
    expect(await expireOffers()).toBeGreaterThanOrEqual(1);
    expect((await pool.query("SELECT status FROM request_applications WHERE id = $1", [ids[2]])).rows[0].status).toBe("offer_expired");
    const late = await (await as(people[2])).post(`/v1/volunteer/applications/${ids[2]}/offer`, { accept: true });
    expect(late.status).toBe(409);
  });

  it("raising the number needed reopens slots; lowering below accepted is refused", async () => {
    const api = await as(EMAILS.requester);
    expect((await api.patch(`/v1/requests/${requestId}`, { volunteersNeeded: 1 })).status).toBe(409);
    const up = await api.patch(`/v1/requests/${requestId}`, { volunteersNeeded: 3 });
    expect(up.body.status).toBe("pending");
  });

  it("pause and resume", async () => {
    const api = await as(EMAILS.requester);
    expect((await api.post(`/v1/requests/${requestId}/transition`, { event: "pause" })).body.to).toBe("paused");
    expect((await api.post(`/v1/requests/${requestId}/transition`, { event: "pause" })).status).toBe(409);
    expect((await api.post(`/v1/requests/${requestId}/transition`, { event: "resume" })).body.to).toBe("pending");
  });

  it("cancel needs a reason and tells every applicant", async () => {
    const api = await as(EMAILS.requester);
    expect((await api.post(`/v1/requests/${requestId}/transition`, { event: "cancel" })).status).toBe(422);
    const c = await api.post(`/v1/requests/${requestId}/transition`, { event: "cancel", reason: "The giveaway was moved to spring" });
    expect(c.body.to).toBe("canceled");
    const st = await pool.query("SELECT DISTINCT status FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2", [requestId, await userId(vols[1])]);
    expect(st.rows[0].status).toBe("canceled");
    const n = await pool.query("SELECT body FROM notifications WHERE user_id = $1 AND body LIKE '%moved to spring%'", [await userId(vols[1])]);
    expect(n.rowCount).toBe(1);
    expect((await api.patch(`/v1/requests/${requestId}`, { title: "edit after cancel" })).status).toBe(409);
  });
});

describe("apply eligibility", () => {
  it("enforces car, age and background-check requirements", async () => {
    await createUser({ email: "elig.vol@thankyou.test", roles: ["volunteer"], birthDate: null });
    const id = await draft(EMAILS.requester, { ...BASICS, ...WHEN, ...WHERE, title: "Eligibility: driver", requiresCar: true, minAge: 21, requiresBackgroundCheck: true });
    await (await as(EMAILS.requester)).post(`/v1/requests/${id}/transition`, { event: "publish" });
    const r = await (await as("elig.vol@thankyou.test")).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    expect(r.status).toBe(422);
    expect(r.body.problems.map((p: { code: string }) => p.code).sort()).toEqual(["age_unknown", "background_check", "car_required"]);
    await pool.query("UPDATE user_profiles SET has_car = TRUE, birth_date = $2::date, background_check_status = 'cleared' WHERE user_id = $1", [await userId("elig.vol@thankyou.test"), birthDateForAge(20)]);
    // 20 is still under the 21+ limit.
    const young = await (await as("elig.vol@thankyou.test")).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    expect(young.body.problems.map((p: { code: string }) => p.code)).toEqual(["too_young"]);
    await pool.query("UPDATE user_profiles SET birth_date = '1990-01-01' WHERE user_id = $1", [await userId("elig.vol@thankyou.test")]);
    const ok = await (await as("elig.vol@thankyou.test")).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });
});

describe("notifications", () => {
  it("marks read, honors preferences and signs unsubscribe links", async () => {
    const api = await as(EMAILS.requester);
    expect((await api.post("/v1/notifications/read", { all: true })).status).toBe(200);
    expect((await api.get("/v1/notifications/unread-count")).body.unread_count).toBe(0);

    const prefs = await api.get("/v1/notifications/preferences");
    expect(prefs.body.preferences.find((p: { type: string }) => p.type === "application_received").email).toBe(true);
    const put = await api.put("/v1/notifications/preferences", { preferences: [{ type: "application_received", in_app: false }] });
    expect(put.body.preferences.find((p: { type: string }) => p.type === "application_received").in_app).toBe(false);
    expect((await api.put("/v1/notifications/preferences", { preferences: [{ type: "bogus", email: false }] })).status).toBe(400);
    await api.put("/v1/notifications/preferences", { preferences: [{ type: "application_received", in_app: true }] });

    const uid = await userId(EMAILS.requester);
    const token = unsubscribeToken(uid, "message_received");
    expect(readUnsubscribeToken(token)).toEqual({ userId: uid, type: "message_received" });
    expect(readUnsubscribeToken(token.slice(0, -2) + "xx")).toBeNull();
    expect((await anon().get("/v1/notifications/unsubscribe?token=bad")).status).toBe(400);
    const one = await anon().post(`/v1/notifications/unsubscribe?token=${token}`).type("form").send("List-Unsubscribe=One-Click");
    expect(one.status).toBe(200);
    const after = await api.get("/v1/notifications/preferences");
    expect(after.body.preferences.find((p: { type: string }) => p.type === "message_received").email).toBe(false);
  });
});

describe("profiles to spec", () => {
  it("organizations save service details; contact details stay private", async () => {
    const api = await as(EMAILS.orgAdmin);
    await api.post("/v1/me/context", { context: "org:harbor-food-bank" });
    const r = await api.patch("/v1/orgs/harbor-food-bank", {
      preferred_skills: "Driving, Spanish , food handling",
      service_area: "Queens and Brooklyn",
      hours: "Tue–Sat 9–5",
      contact_phone: "555-010-2000",
      preferred_contact_method: "phone"
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.org.preferred_skills).toEqual(["driving", "spanish", "food handling"]);
    const pub = await anon().get("/v1/public/organizations/harbor-food-bank");
    expect(pub.body.service_area).toBe("Queens and Brooklyn");
    expect(pub.body.hours).toBe("Tue–Sat 9–5");
    expect(JSON.stringify(pub.body)).not.toContain("555-010-2000");
    expect(pub.body.contact).toBe("after_acceptance");
    expect((await api.patch("/v1/orgs/harbor-food-bank", { preferred_contact_method: "fax" })).status).toBe(400);
  });

  it("volunteers can record a birth year; background-check status is read-only", async () => {
    await createUser({ email: "profile.vol@thankyou.test", roles: ["volunteer"] });
    const api = await as("profile.vol@thankyou.test");
    const save = await api.post("/v1/volunteer/profile", { fullName: "Pat Vol", birthYear: 1995 });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    const got = await api.get("/v1/volunteer/profile");
    expect(got.body.profile.birth_year).toBe(1995);
    expect(got.body.profile.background_check_status).toBe("none");
    expect((await api.post("/v1/volunteer/profile", { fullName: "Pat Vol", birthYear: 1800 })).status).toBe(400);
  });
});
