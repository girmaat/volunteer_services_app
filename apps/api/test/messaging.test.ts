import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { anon, as, createUser, EMAILS, getApp, pool, tokenFor, userId, ownerAct } from "./helpers";
import { maskContacts, holdReason } from "../src/modules/messaging/safety";
import { runHourly } from "../src/jobs/maintenance";

const soon = (days: number) => new Date(Date.now() + days * 86400_000).toISOString();

async function liveRequest(email: string, title: string, extra: Record<string, unknown> = {}, as_: "requester" | "org" = "requester") {
  const api = await as(email);
  const d = await api.post("/v1/requests", {
    as: as_,
    title,
    description: "A request created by the messaging tests with enough words.",
    category: "errands",
    mode: "in-person",
    publicArea: "Upper West Side, Manhattan, NY",
    exactAddress: "1 Test Plaza, Apt 2",
    scheduleType: "one_time",
    startsAt: soon(4),
    volunteersNeeded: 2,
    ...extra
  });
  expect(d.status, JSON.stringify(d.body)).toBe(201);
  const p = await api.post(`/v1/requests/${d.body.id}/transition`, { event: "publish" });
  expect(p.status, JSON.stringify(p.body)).toBe(200);
  return String(d.body.id);
}

/** The organizer (or requester) opens the thread with an applicant and writes first. */
async function ownerOpens(ownerEmail: string, requestId: string, volEmail: string, body = "Thanks for applying! Any questions?") {
  const owner = await as(ownerEmail);
  const c = await owner.post("/v1/inbox/conversations", { requestId, volunteerUserId: await userId(volEmail) });
  expect(c.status, JSON.stringify(c.body)).toBe(201);
  const m = await owner.post(`/v1/inbox/conversations/${c.body.id}/messages`, { body });
  expect(m.status, JSON.stringify(m.body)).toBe(201);
  return String(c.body.id);
}

describe("message safety helpers", () => {
  it("leaves dates alone", () => {
    expect(maskContacts("Starts 2026-10-24 or 10/24/2026")).toBe("Starts 2026-10-24 or 10/24/2026");
  });
  it("masks emails, phones, links and handles", () => {
    const m = maskContacts("Call (555) 123-4567 or +1 555 987 6543, mail me@example.com, see www.site.com or https://x.io/a, ig: @rose_99. Meet at 10:30 on 5/12.");
    expect(m).not.toMatch(/555|example\.com|site\.com|x\.io|rose_99/);
    expect(m).toContain("10:30 on 5/12");
  });
  it("holds scam patterns and new-account links", () => {
    expect(holdReason("Can you buy a gift card for me?", { unlocked: true, senderAgeDays: 100 })).toMatch(/gift/);
    expect(holdReason("Send it by Zelle", { unlocked: true, senderAgeDays: 100 })).toMatch(/payment/);
    expect(holdReason("see https://bit.ly/x", { unlocked: false, senderAgeDays: 1 })).toMatch(/Link/);
    expect(holdReason("see https://bit.ly/x", { unlocked: false, senderAgeDays: 30 })).toBeNull();
    // An email address is masked, not held: its domain isn't a link.
    expect(holdReason("write to max.helper@example.org", { unlocked: false, senderAgeDays: 1 })).toBeNull();
    expect(holdReason("see example.org/sign-up", { unlocked: false, senderAgeDays: 1 })).toMatch(/Link/);
    expect(holdReason("See you Saturday at 10!", { unlocked: false, senderAgeDays: 0 })).toBeNull();
  });
});

describe("conversations", () => {
  let requestId = "";
  let convId = "";
  let applicationId = "";
  const vol = "msg.vol@volunteer-services-app.test";

  it("volunteers can't start a conversation; they reply once the organizer writes", async () => {
    await createUser({ email: vol, roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = $1", [vol]);
    requestId = await liveRequest(EMAILS.requester, "Messaging: move a couch");
    const v = await as(vol);
    const a = await v.post(`/v1/volunteer/opportunities/${requestId}/apply`, { message: "Hi! I can help Saturday." });
    expect(a.status).toBe(201);
    applicationId = a.body.applicationId;
    // Applying doesn't open a thread, and a volunteer-opened thread is read-only until the organizer writes.
    const list = await (await as(EMAILS.requester)).get("/v1/inbox/conversations?as=requester");
    expect(list.body.conversations.find((c: { request_id: string }) => c.request_id === requestId)).toBeFalsy();
    const mine = await v.post("/v1/inbox/conversations", { requestId });
    expect(mine.status).toBe(201);
    expect(mine.body.can_send).toBe(false);
    expect(mine.body.waiting_for_organizer).toBe(true);
    const early = await v.post(`/v1/inbox/conversations/${mine.body.id}/messages`, { body: "Hello?" });
    expect(early.status).toBe(403);
    expect(early.body.error.code).toBe("reply_only");

    convId = await ownerOpens(EMAILS.requester, requestId, vol);
    expect(convId).toBe(mine.body.id);
    const t = await v.get(`/v1/inbox/conversations/${convId}`);
    expect(t.body.conversation.can_send).toBe(true);
    expect(t.body.conversation.waiting_for_organizer).toBe(false);
    expect((await v.post(`/v1/inbox/conversations/${convId}/messages`, { body: "Sure. Text me at 555-222-3333." })).status).toBe(201);
    const owners = await (await as(EMAILS.requester)).get("/v1/inbox/conversations?as=requester");
    const conv = owners.body.conversations.find((c: { id: string }) => c.id === convId);
    expect(conv.unread).toBe(1);
    expect(conv.last_body).not.toContain("555-222-3333");
  });

  it("masks contact details until the volunteer is accepted", async () => {
    const owner = await as(EMAILS.requester);
    let t = await owner.get(`/v1/inbox/conversations/${convId}`);
    expect(t.body.conversation.contacts_unlocked).toBe(false);
    expect(t.body.messages[1].body).toContain("[contact details hidden until accepted]");
    expect(t.body.conversation.with_name).toBeTruthy();
    // Reading clears unread.
    expect((await owner.get("/v1/inbox/conversations?as=requester")).body.conversations.find((c: { id: string }) => c.id === convId).unread).toBe(0);
    await ownerAct(owner, applicationId, "accept");
    t = await owner.get(`/v1/inbox/conversations/${convId}`);
    expect(t.body.conversation.contacts_unlocked).toBe(true);
    expect(t.body.messages[1].body).toContain("555-222-3333");
  });

  it("holds scam-like messages for review; the recipient never sees them", async () => {
    const v = await as(vol);
    const held = await v.post(`/v1/inbox/conversations/${convId}/messages`, { body: "Could you pay me back with a gift card?" });
    expect(held.status).toBe(201);
    expect(held.body.status).toBe("held");
    const mine = await v.get(`/v1/inbox/conversations/${convId}`);
    expect(mine.body.messages.at(-1).status).toBe("held");
    const theirs = await (await as(EMAILS.requester)).get(`/v1/inbox/conversations/${convId}`);
    expect(JSON.stringify(theirs.body)).not.toContain("gift card");
  });

  it("notifies the recipient once per conversation", async () => {
    const v = await as(vol);
    await v.post(`/v1/inbox/conversations/${convId}/messages`, { body: "See you at 10." });
    await v.post(`/v1/inbox/conversations/${convId}/messages`, { body: "Bringing straps." });
    const n = await pool.query("SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND type = 'message_received' AND read_at IS NULL AND data->>'conversationId' = $2", [
      await userId(EMAILS.requester),
      convId
    ]);
    expect(n.rows[0].c).toBe(1);
  });

  it("polls for new messages after a timestamp", async () => {
    const owner = await as(EMAILS.requester);
    const since = new Date(Date.now() - 1000).toISOString();
    await (await as(vol)).post(`/v1/inbox/conversations/${convId}/messages`, { body: "Polling check" });
    const p = await owner.get(`/v1/inbox/conversations/${convId}/messages?after=${encodeURIComponent(since)}`);
    expect(p.body.messages.map((m: { body: string }) => m.body)).toContain("Polling check");
  });

  it("outsiders can't read or post", async () => {
    const outsider = await as(EMAILS.remoteVolunteer);
    expect((await outsider.get(`/v1/inbox/conversations/${convId}`)).status).toBe(404);
    expect((await outsider.post(`/v1/inbox/conversations/${convId}/messages`, { body: "hi" })).status).toBe(404);
    expect((await outsider.post("/v1/inbox/conversations", { requestId })).status).toBe(404);
  });

  it("attachments: allowed types only, visible to participants", async () => {
    const v = await as(vol);
    const token = await tokenFor(vol);
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    const up = await anon().post(`/v1/inbox/conversations/${convId}/attachments`).set("authorization", `Bearer ${token}`).attach("file", pdf, "waiver.pdf");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const dl = await (await as(EMAILS.requester)).get(`/v1/inbox/attachments/${up.body.attachment_id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-type"]).toContain("application/pdf");
    expect(dl.headers["content-disposition"]).toContain("waiver.pdf");
    expect((await (await as(EMAILS.remoteVolunteer)).get(`/v1/inbox/attachments/${up.body.attachment_id}`)).status).toBe(404);
    const fake = await anon().post(`/v1/inbox/conversations/${convId}/attachments`).set("authorization", `Bearer ${token}`).attach("file", Buffer.from("MZ\x90\x00 not a pdf"), "invoice.pdf");
    expect(fake.status).toBe(422);
    const eicar = await anon()
      .post(`/v1/inbox/conversations/${convId}/attachments`)
      .set("authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"), "notes.txt");
    expect(eicar.status).toBe(422);
    const big = await anon().post(`/v1/inbox/conversations/${convId}/attachments`).set("authorization", `Bearer ${token}`).attach("file", Buffer.alloc(5 * 1024 * 1024 + 10, 65), "big.txt");
    expect(big.status).toBe(400);
    const list = await v.get(`/v1/inbox/conversations/${convId}`);
    expect(list.body.messages.some((m: { attachment: { name: string } | null }) => m.attachment?.name === "waiver.pdf")).toBe(true);
  });

  it("report from the thread files a user report", async () => {
    const r = await (await as(EMAILS.requester)).post(`/v1/inbox/conversations/${convId}/report`, { category: "scam", details: "asked for a gift card" });
    expect(r.status).toBe(201);
    const row = await pool.query("SELECT target_user_id, details FROM user_reports WHERE id = $1", [r.body.reportId]);
    expect(row.rows[0].target_user_id).toBe(await userId(vol));
    expect(row.rows[0].details).toContain(convId);
  });

  it("ending a conversation makes it read-only for both", async () => {
    const owner = await as(EMAILS.requester);
    expect((await owner.post(`/v1/inbox/conversations/${convId}/end`)).body.status).toBe("ended");
    const s = await (await as(vol)).post(`/v1/inbox/conversations/${convId}/messages`, { body: "still there?" });
    expect(s.status).toBe(409);
  });
});

describe("organization inbox, limits, blocking and archiving", () => {
  it("org admins and managers share the org inbox; plain members and outsiders don't", async () => {
    await createUser({ email: "orgmsg.vol@volunteer-services-app.test", roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'orgmsg.vol@volunteer-services-app.test'");
    const admin = await as(EMAILS.orgAdmin);
    await admin.post("/v1/me/context", { context: "org:harbor-food-bank" });
    const id = await liveRequest(EMAILS.orgAdmin, "Messaging: org pantry shift", {}, "org");
    await (await as("orgmsg.vol@volunteer-services-app.test")).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "Count me in" });
    await ownerOpens(EMAILS.orgAdmin, id, "orgmsg.vol@volunteer-services-app.test", "Thanks for signing up!");
    await createUser({ email: "org.manager2@volunteer-services-app.test", org: { slug: "harbor-food-bank", role: "manager" } });
    const mgr = await as("org.manager2@volunteer-services-app.test");
    const list = await mgr.get("/v1/inbox/conversations?as=org");
    const conv = list.body.conversations.find((c: { request_id: string }) => c.request_id === id);
    expect(conv).toBeTruthy();
    expect(conv.with_name).toBeTruthy();
    const reply = await mgr.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "Welcome aboard!" });
    expect(reply.status).toBe(201);
    const volView = await (await as("orgmsg.vol@volunteer-services-app.test")).get(`/v1/inbox/conversations/${conv.id}`);
    expect(volView.body.conversation.with_name).toBe("Harbor Food Bank");
    expect((await (await as(EMAILS.orgMember)).get(`/v1/inbox/conversations/${conv.id}`)).status).toBe(404);
  });

  it("rate-limits bursts of messages", async () => {
    await createUser({ email: "burst.vol@volunteer-services-app.test", roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'burst.vol@volunteer-services-app.test'");
    const id = await liveRequest(EMAILS.requester, "Messaging: burst test");
    const v = await as("burst.vol@volunteer-services-app.test");
    await v.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hello" });
    await ownerOpens(EMAILS.requester, id, "burst.vol@volunteer-services-app.test");
    const conv = (await v.get("/v1/inbox/conversations?as=volunteer")).body.conversations.find((c: { request_id: string }) => c.request_id === id);
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: `msg ${i}` })).status;
    expect(last).toBe(429);
  });

  it("limits how many new conversations a brand-new account can start per day", async () => {
    const uid = await createUser({ email: "fresh.vol@volunteer-services-app.test", roles: ["volunteer"] });
    // Five first contacts already today, each in its own conversation.
    const open = await pool.query("SELECT id, requester_user_id FROM service_requests WHERE status = 'open' AND requester_user_id <> $1 LIMIT 5", [uid]);
    for (const r of open.rows) {
      const c = await pool.query("INSERT INTO conversations (kind, request_id, volunteer_user_id, owner_user_id) VALUES ('request', $1, $2, $3) RETURNING id", [r.id, uid, r.requester_user_id]);
      await pool.query("INSERT INTO direct_messages (sender_user_id, recipient_user_id, body, conversation_id) VALUES ($1, $2, 'hi', $3)", [uid, r.requester_user_id, c.rows[0].id]);
    }
    const id = await liveRequest(EMAILS.requester, "Messaging: sixth contact");
    const v = await as("fresh.vol@volunteer-services-app.test");
    const ap = await v.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hello there" });
    expect(ap.status).toBe(201); // the application itself still goes through
    await ownerOpens(EMAILS.requester, id, "fresh.vol@volunteer-services-app.test");
    const conv = (await v.get("/v1/inbox/conversations?as=volunteer")).body.conversations.find((c: { request_id: string }) => c.request_id === id);
    const s = await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "Following up" });
    expect(s.status).toBe(429);
    expect(s.body.error.code).toBe("first_contact_limit");
  });

  it("blocking from a thread ends it and stops replies", async () => {
    await createUser({ email: "block.vol@volunteer-services-app.test", roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'block.vol@volunteer-services-app.test'");
    const id = await liveRequest(EMAILS.requester, "Messaging: block test");
    const v = await as("block.vol@volunteer-services-app.test");
    await v.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    await ownerOpens(EMAILS.requester, id, "block.vol@volunteer-services-app.test");
    const conv = (await v.get("/v1/inbox/conversations?as=volunteer")).body.conversations.find((c: { request_id: string }) => c.request_id === id);
    const b = await (await as(EMAILS.requester)).post(`/v1/inbox/conversations/${conv.id}/block`, { reason: "rude" });
    expect(b.body.blocked).toBe(true);
    expect((await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "why?" })).status).toBe(409);
    await pool.query("DELETE FROM user_blocks WHERE blocked_user_id = $1", [await userId("block.vol@volunteer-services-app.test")]);
  });

  it("archives conversations 14 days after the request completes", async () => {
    await createUser({ email: "archive.vol@volunteer-services-app.test", roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'archive.vol@volunteer-services-app.test'");
    const id = await liveRequest(EMAILS.requester, "Messaging: archive test");
    const v = await as("archive.vol@volunteer-services-app.test");
    await v.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    await ownerOpens(EMAILS.requester, id, "archive.vol@volunteer-services-app.test");
    await pool.query("UPDATE service_requests SET status = 'completed', completed_at = NOW() - INTERVAL '15 days' WHERE id = $1", [id]);
    await runHourly();
    const conv = (await v.get("/v1/inbox/conversations?as=volunteer")).body.conversations.find((c: { request_id: string }) => c.request_id === id);
    expect(conv.status).toBe("archived");
    expect((await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "late" })).status).toBe(409);
  });

  it("shadow-banned senders see their messages; nobody else does", async () => {
    await createUser({ email: "shadow.vol@volunteer-services-app.test", roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'shadow.vol@volunteer-services-app.test'");
    const id = await liveRequest(EMAILS.requester, "Messaging: shadow test");
    const v = await as("shadow.vol@volunteer-services-app.test");
    await v.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "first" });
    await ownerOpens(EMAILS.requester, id, "shadow.vol@volunteer-services-app.test");
    await pool.query("UPDATE users SET shadow_banned = TRUE WHERE email = 'shadow.vol@volunteer-services-app.test'");
    const conv = (await v.get("/v1/inbox/conversations?as=volunteer")).body.conversations.find((c: { request_id: string }) => c.request_id === id);
    const s = await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "can anyone hear me" });
    expect(s.body.status).toBe("sent");
    expect(JSON.stringify((await v.get(`/v1/inbox/conversations/${conv.id}`)).body)).toContain("can anyone hear me");
    expect(JSON.stringify((await (await as(EMAILS.requester)).get(`/v1/inbox/conversations/${conv.id}`)).body)).not.toContain("can anyone hear me");
  });
});

describe("live updates (SSE)", () => {
  it("streams a message event to the recipient", async () => {
    const server = getApp().listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const token = await tokenFor(EMAILS.requester);
      const ctrl = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/v1/inbox/stream`, { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      const reader = res.body!.getReader();
      await createUser({ email: "sse.vol@volunteer-services-app.test", roles: ["volunteer"] });
      await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = 'sse.vol@volunteer-services-app.test'");
      const id = await liveRequest(EMAILS.requester, "Messaging: live test");
      const v = await as("sse.vol@volunteer-services-app.test");
      await v.post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hello live" });
      await ownerOpens(EMAILS.requester, id, "sse.vol@volunteer-services-app.test");
      const conv = (await v.get("/v1/inbox/conversations?as=volunteer")).body.conversations.find((c: { request_id: string }) => c.request_id === id);
      const sent = await v.post(`/v1/inbox/conversations/${conv.id}/messages`, { body: "live ping" });
      expect(sent.status).toBe(201);
      let text = "";
      const deadline = Date.now() + 3000;
      while (!text.includes(conv.id) && Date.now() < deadline) {
        const chunk = await Promise.race([reader.read(), new Promise<{ value?: Uint8Array }>((r) => setTimeout(() => r({}), 500))]);
        if (chunk.value) text += new TextDecoder().decode(chunk.value);
      }
      expect(text).toContain("event: message");
      expect(text).toContain(conv.id);
      ctrl.abort();
    } finally {
      server.close();
    }
  });
});

describe("contact privacy outside the inbox", () => {
  it("organizations and requesters don't see applicant emails before acceptance", async () => {
    await createUser({ email: "privacy.vol@volunteer-services-app.test", roles: ["volunteer"] });
    const admin = await as(EMAILS.orgAdmin);
    await admin.post("/v1/me/context", { context: "org:harbor-food-bank" });
    const id = await liveRequest(EMAILS.orgAdmin, "Privacy: org shift", {}, "org");
    const ap = await (await as("privacy.vol@volunteer-services-app.test")).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi, call 917-555-0142" });
    const before = await admin.get("/v1/org/applications");
    expect(JSON.stringify(before.body)).not.toContain("privacy.vol@volunteer-services-app.test");
    expect(JSON.stringify(before.body)).not.toContain("917-555-0142");
    expect(JSON.stringify((await admin.get(`/v1/requests/${id}/applicants`)).body)).not.toContain("917-555-0142");
    await admin.patch(`/v1/org/applications/${ap.body.applicationId}`, { status: "accepted" });
    const after = await admin.get("/v1/org/applications");
    expect(JSON.stringify(after.body)).toContain("privacy.vol@volunteer-services-app.test");
    expect(JSON.stringify(after.body)).toContain("917-555-0142");

    const rid = await liveRequest(EMAILS.requester, "Privacy: requester ask");
    await (await as("privacy.vol@volunteer-services-app.test")).post(`/v1/volunteer/opportunities/${rid}/apply`, { message: "hi" });
    for (const p of ["/v1/requester/applications/pending", "/v1/requester/dashboard", `/v1/requests/${rid}/applicants`]) {
      expect(JSON.stringify((await (await as(EMAILS.requester)).get(p)).body), p).not.toContain("privacy.vol@volunteer-services-app.test");
    }
  });
});

describe("support threads (organization ↔ Volunteer Services team)", () => {
  it("org members message the platform team; admins see and answer; others can't", async () => {
    const olivia = await as(EMAILS.orgAdmin);
    await olivia.post("/v1/me/context", { context: "org:harbor-food-bank" });
    const s = await olivia.post("/v1/inbox/support", { body: "How do we get our second location verified?" });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect(s.body.kind).toBe("support");
    expect(s.body.with_name).toBe("Volunteer Services support");
    expect(s.body.can_send).toBe(true);
    // Same thread the second time.
    expect((await olivia.post("/v1/inbox/support", {})).body.id).toBe(s.body.id);
    expect((await olivia.get("/v1/inbox/conversations?as=org")).body.conversations.map((c: { id: string }) => c.id)).toContain(s.body.id);

    const admin = await as(EMAILS.admin);
    const list = await admin.get("/v1/admin/support");
    expect(list.status).toBe(200);
    const row = list.body.items.find((x: { id: string }) => x.id === s.body.id);
    expect(row.awaiting_reply).toBe(true);
    expect(row.org_name).toBe("Harbor Food Bank");
    expect((await admin.post(`/v1/inbox/conversations/${s.body.id}/messages`, { body: "Send us the address and we'll review it." })).status).toBe(201);
    expect(JSON.stringify((await olivia.get(`/v1/inbox/conversations/${s.body.id}`)).body)).toContain("we'll review it");

    // Volunteers without an organization use the contact form; other org staff can't read the thread.
    expect((await (await as(EMAILS.volunteer)).post("/v1/inbox/support", { body: "hi" })).status).toBe(403);
    expect((await (await as(EMAILS.orgMember)).get(`/v1/inbox/conversations/${s.body.id}`)).status).toBe(404);
    expect([403, 404]).toContain((await (await as(EMAILS.moderator)).get("/v1/admin/support")).status);
  });
});

describe("who can message you", () => {
  it("'No one' stops messages to that person; 'Anyone' lets them through", async () => {
    const vol = "perm.vol@volunteer-services-app.test";
    await createUser({ email: vol, roles: ["volunteer"] });
    await pool.query("UPDATE users SET created_at = NOW() - INTERVAL '30 days' WHERE email = $1", [vol]);
    const id = await liveRequest(EMAILS.requester, "Messaging: permission test");
    await (await as(vol)).post(`/v1/volunteer/opportunities/${id}/apply`, { message: "hi" });
    const v = await as(vol);
    const set = (perm: string) => v.post("/v1/settings/privacy-safety", { public_profile_visible: true, messaging_permission: perm });
    const r1 = await set("no_one");
    expect([200, 201], JSON.stringify(r1.body)).toContain(r1.status);
    const owner = await as(EMAILS.requester);
    const c = await owner.post("/v1/inbox/conversations", { requestId: id, volunteerUserId: await userId(vol) });
    const blocked = await owner.post(`/v1/inbox/conversations/${c.body.id}/messages`, { body: "Hello!" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("not_accepting");
    await set("anyone");
    expect((await owner.post(`/v1/inbox/conversations/${c.body.id}/messages`, { body: "Hello!" })).status).toBe(201);
  });
});
