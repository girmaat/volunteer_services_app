import { describe, expect, it, vi } from "vitest";
import { pool, userId, EMAILS, createUser } from "./helpers";
import { renderEmail } from "../src/modules/notifications/templates";
import * as email from "../src/auth/email";
import { notify } from "../src/modules/notifications/service";
import { sendAttendanceReminders } from "../src/modules/notifications/events";

describe("email templates", () => {
  it("renders HTML and text with escaping and an unsubscribe link", () => {
    const r = renderEmail({ subject: "Hi <b>", heading: "Hello <script>", lines: ["a & b"], cta: { label: "Go", url: "https://x.test/a?b=1&c=2" } }, { preferencesUrl: "https://x.test/p", unsubscribeUrl: "https://x.test/u" });
    expect(r.html).toContain("Hello &lt;script&gt;");
    expect(r.html).toContain("a &amp; b");
    expect(r.html).toContain("https://x.test/u");
    expect(r.text).toContain("Unsubscribe from these emails: https://x.test/u");
    expect(r.text).toContain("Go: https://x.test/a?b=1&c=2");
  });
});

describe("notify()", () => {
  it("sends HTML + text with List-Unsubscribe, honors preferences and throttles digests", async () => {
    const spy = vi.spyOn(email, "sendEmail");
    const uid = await createUser({ email: "notify.fresh@volunteer-services-app.test", roles: ["requester"] });
    await notify(uid, "message_received", { title: "t", email: { subject: "S1", heading: "H", lines: ["x"], throttleMinutes: 60 } });
    await notify(uid, "message_received", { title: "t", email: { subject: "S2", heading: "H", lines: ["x"], throttleMinutes: 60 } });
    const calls = spy.mock.calls.filter((c) => c[0].subject.startsWith("S"));
    expect(calls).toHaveLength(1);
    expect(calls[0][0].html).toContain("<!doctype html>");
    expect(calls[0][0].headers?.["List-Unsubscribe"]).toMatch(/^<http.*\/v1\/notifications\/unsubscribe\?token=/);
    expect(calls[0][0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    await pool.query("INSERT INTO notification_preferences (user_id, type, email, in_app) VALUES ($1, 'review_requested', FALSE, FALSE)", [uid]);
    const r = await notify(uid, "review_requested", { title: "t", email: { subject: "S3", heading: "H", lines: ["x"] } });
    expect(r).toEqual({ notificationId: null, emailed: false });
    spy.mockRestore();
  });

  it("sends 48 h attendance reminders once", async () => {
    const vol = await userId(EMAILS.volunteer);
    const req = await pool.query("SELECT id FROM service_requests WHERE status = 'open' LIMIT 1");
    await pool.query("INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at) VALUES ($1, $2, 'confirmed', NOW() + INTERVAL '48 hours')", [vol, req.rows[0].id]);
    const first = await sendAttendanceReminders();
    expect(first).toBeGreaterThan(0);
    expect(await sendAttendanceReminders()).toBe(0);
  });
});

describe("notification detail (deep links from the bell)", () => {
  it("returns one of your own notifications and nobody else's", async () => {
    const { as } = await import("./helpers");
    const uid = await createUser({ email: "notify.detail@volunteer-services-app.test", roles: ["volunteer"] });
    const { notificationId } = await notify(uid, "message_received", { title: "New message", href: "/messages" });
    const me = await as("notify.detail@volunteer-services-app.test");
    const r = await me.get(`/v1/notifications/${notificationId}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: notificationId, title: "New message", href: "/messages", read_at: null });
    // The fixed paths still win over :id.
    expect((await me.get("/v1/notifications/unread-count")).status).toBe(200);
    expect((await me.get("/v1/notifications/not-a-uuid")).status).toBe(400);
    expect((await (await as(EMAILS.volunteer)).get(`/v1/notifications/${notificationId}`)).status).toBe(404);
  });
});
