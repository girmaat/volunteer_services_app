/**
 * UAT scenario data: puts the seeded app into ready-to-test states (applications waiting for a
 * decision, hours waiting for approval, a conversation, reports, a join request…), so a person can
 * test each screen without first building the state by hand.
 *
 *   pnpm db:uat          reset the database, seed, then run this (local data is disposable)
 *   pnpm db:seed:uat     run this alone, on a freshly seeded database
 *
 * It drives the real API in-process, signing in as the seeded personas and making the same calls the
 * screens make, so notifications, schedules and hours come out exactly as they would in use.
 * The scenarios are listed in docs/uat/README.md ("Ready-made test data").
 */
import "dotenv/config";
import type { AddressInfo } from "node:net";

process.env.JOBS_DISABLED = "true"; // run follow-up work inline instead of queueing it
process.env.GEOCODING_DISABLED = "true";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "warn";
process.env.EMAIL_TRANSPORT = "disabled"; // scenario emails would only clutter the console

const PASSWORD = process.env.SEED_PASSWORD || (process.env.NODE_ENV === "production" ? "" : "Password!");
const E = {
  admin: "admin@thankyou.test",
  olivia: "org.admin@thankyou.test",
  rose: "requester@thankyou.test",
  valerie: "volunteer.local@thankyou.test",
  ravi: "volunteer.remote@thankyou.test",
  diego: "dual.role@thankyou.test",
  tara: "teen.volunteer@thankyou.test",
  sam: "school.admin@thankyou.test"
} as const;

async function main() {
  if (!PASSWORD) throw new Error("SEED_PASSWORD is required when NODE_ENV=production");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to load UAT scenarios into production");
  const { createApp } = await import("../app");
  const { pool } = await import("../lib/db");

  const server = createApp().listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const tokens = new Map<string, string>();

  async function call(email: string, method: string, path: string, body?: unknown) {
    let token = tokens.get(email);
    if (!token) {
      const r = await fetch(`${base}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
      const j = (await r.json()) as { sessionToken?: string; message?: string };
      if (!r.ok || !j.sessionToken) throw new Error(`Sign-in failed for ${email} (${r.status}: ${j.message ?? ""}). Seed first, with the same SEED_PASSWORD.`);
      token = j.sessionToken;
      tokens.set(email, token);
    }
    const form = body instanceof FormData;
    const r = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body && !form ? { "content-type": "application/json" } : {}) },
      body: form ? body : body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!r.ok) throw new Error(`${email} ${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
    return json;
  }

  const requestId = async (title: string) => {
    const r = await pool.query("SELECT id FROM service_requests WHERE title = $1", [title]);
    if (!r.rowCount) throw new Error(`Seeded request not found: "${title}". Run pnpm db:seed first.`);
    return String(r.rows[0].id);
  };
  const apply = async (email: string, rid: string, message: string) => String((await call(email, "POST", `/v1/volunteer/opportunities/${rid}/apply`, { message })).applicationId);
  const act = (owner: string, rid: string, appId: string, action: string) => call(owner, "POST", `/v1/requests/${rid}/applicants/${appId}`, { action });
  const contributionFor = async (appId: string) => String((await pool.query("SELECT id FROM contributions WHERE application_id = $1 ORDER BY created_at LIMIT 1", [appId])).rows[0].id);

  try {
    const already = await pool.query("SELECT 1 FROM request_applications a JOIN service_requests r ON r.id = a.request_id WHERE r.title = 'Help me carry groceries upstairs'");
    if (already.rowCount) {
      console.log("UAT scenarios are already loaded. To start over: pnpm db:uat (resets the local database).");
      return;
    }

    const groceries = await requestId("Help me carry groceries upstairs");
    const walk = await requestId("Walk and talk in the park");
    const phone = await requestId("Set up my new phone");
    const benefits = await requestId("Fill in an online benefits form");
    const saturday = await requestId("Saturday distribution shift");
    const meals = await requestId("Deliver meals to homebound seniors");
    const garden = await requestId("Community garden weeding");
    const setup = await requestId("Event setup crew");
    const homework = await requestId("After-school homework club helpers");

    // Organizers and requesters start conversations; volunteers reply.
    const opens = async (owner: string, requestId: string, volunteer: string, body: string) => {
      const vid = (await pool.query("SELECT id FROM users WHERE email = $1", [volunteer])).rows[0].id;
      const c = await call(owner, "POST", "/v1/inbox/conversations", { requestId, volunteerUserId: vid });
      await call(owner, "POST", `/v1/inbox/conversations/${c.id}/messages`, { body });
      return String(c.id);
    };

    // S1 · Rose ⇄ Valerie, groceries: accepted, marked complete; 2 h waiting for Rose's approval;
    // Valerie has reviewed Rose (Rose's review still to do); a short message thread.
    const s1 = await apply(E.valerie, groceries, "Hi Rose, I live nearby and can help most Thursdays after 5 pm.");
    await act(E.rose, groceries, s1, "accept");
    const convo = { id: await opens(E.rose, groceries, E.valerie, "Thank you for offering, Valerie! When could you come?") };
    await call(E.valerie, "POST", `/v1/inbox/conversations/${convo.id}/messages`, { body: "Hi Rose! I can come Thursday at 5:30 pm. Which buzzer should I press?" });
    await call(E.rose, "POST", `/v1/inbox/conversations/${convo.id}/messages`, { body: "Press 4B. See you Thursday!" });
    await act(E.rose, groceries, s1, "complete");
    await call(E.valerie, "POST", "/v1/reviews", { applicationId: s1, overall: 5, reliability: 5, clarity: 5, comment: "Rose had everything ready and explained exactly what she needed.", wouldWorkAgain: true });

    // S2 · Rose's park walk (1 spot): two volunteers waiting for a decision.
    await apply(E.diego, walk, "I walk in Riverside Park most mornings and would enjoy the company.");
    await apply(E.valerie, walk, "Happy to join you on Tuesdays or Thursdays.");

    // S3 · Rose ⇄ Diego, phone setup: complete, hours approved, both reviews published.
    const s3 = await apply(E.diego, phone, "I set up phones for my parents; I can transfer contacts and photos.");
    await opens(E.rose, phone, E.diego, "Hi Diego, thanks! Could you come Saturday morning?");
    await act(E.rose, phone, s3, "accept");
    await act(E.rose, phone, s3, "complete");
    await call(E.rose, "POST", `/v1/contributions/${await contributionFor(s3)}/decide`, { action: "approve" });
    await call(E.diego, "POST", "/v1/reviews", { applicationId: s3, overall: 5, reliability: 5, clarity: 4, comment: "Friendly and well organized.", wouldWorkAgain: true });
    await call(E.rose, "POST", "/v1/reviews", { applicationId: s3, overall: 5, reliability: 5, skill: 5, comment: "Diego was patient and moved everything over in an hour.", wouldWorkAgain: true });

    // S4 · Harbor's Saturday shift: Valerie accepted (sees the exact address); Diego and Tara (17) waiting.
    const s4 = await apply(E.valerie, saturday, "I've done food distribution before and can lift boxes.");
    await act(E.olivia, saturday, s4, "accept");
    await apply(E.diego, saturday, "Count me in for Saturday. I speak Spanish.");
    await apply(E.tara, saturday, "I'd like to help. This counts toward my school service hours.");
    for (const v of [E.valerie, E.diego, E.tara]) await opens(E.olivia, saturday, v, "Thanks for signing up for Saturday! Doors open at 1:45 pm.");

    // S5 · Harbor's meal delivery: Valerie accepted and reported 2.5 h, waiting in Harbor's Hours queue.
    const s5 = await apply(E.valerie, meals, "I have a car and know the Astoria streets well.");
    await opens(E.olivia, meals, E.valerie, "Welcome aboard, Valerie! Route sheets are at the front desk.");
    await act(E.olivia, meals, s5, "accept");
    await call(E.valerie, "POST", "/v1/volunteer/contributions", { applicationId: s5, hours: 2.5, description: "Delivered 12 meals on the Astoria route." });

    // S6 · Lincoln High's homework club: Tara (17) accepted by the school.
    const s6 = await apply(E.tara, homework, "I'm a junior and good at algebra.");
    await act(E.sam, homework, s6, "accept");

    // S7 · Safety: a report on a request, waiting in the admin Reports queue.
    await call(E.valerie, "POST", "/v1/settings/reports", {
      target_type: "request",
      target_request_id: benefits,
      category: "scam",
      details: "UAT sample report: the poster asked me to send my bank login to 'verify' the form."
    });

    // S8 · Ravi asks to join Harbor Food Bank (waiting for an admin on Team → Join requests).
    await call(E.ravi, "POST", "/v1/orgs/join", { orgSlug: "harbor-food-bank", adultConfirmed: true });

    // S9 · A shared link to the garden weeding opportunity, reported by two people (waiting for moderation).
    const share = await call(E.olivia, "POST", "/v1/shares", { share_type: "OPPORTUNITY", target_ref: garden, visibility: "public" });
    for (const who of [E.valerie, E.diego]) {
      await call(who, "POST", `/v1/shares/${share.token}/report`, { reason: "misleading", details: "UAT sample share report: the date on the shared card looked wrong." });
    }

    // S10 · Valerie's saved opportunities.
    for (const rid of [garden, setup]) await call(E.valerie, "POST", `/v1/volunteer/opportunities/${rid}/save`);

    // S11 · Rose's ID is checked and approved, so she can post sensitive requests (help inside a home…).
    // S12 · Ravi's ID is waiting in the admin Verification queue.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    for (const who of [E.rose, E.ravi]) {
      const form = new FormData();
      form.set("document", new Blob([png], { type: "image/png" }), "sample-id.png");
      await call(who, "POST", "/v1/onboarding/verification", form);
    }
    const roseId = String((await pool.query("SELECT id FROM users WHERE email = $1", [E.rose])).rows[0].id);
    await call(E.admin, "POST", `/v1/admin/user-verification/${roseId}/approve`, { notes: "UAT seed: ID checked" });

    // S13 · Advertisement panels on, with one live ad per side, one turned off and one expired.
    await call(E.admin, "POST", "/v1/admin/ads/settings", { left: true, right: true });
    const day = 86_400_000;
    const ads = [
      { title: "Harbor Food Bank holiday drive", body: "Sort and pack holiday meal boxes with neighbors. Shifts every Saturday in December.", link_url: "/organizations/harbor-food-bank", placement: "left" },
      { title: "Become a reading buddy", body: "Read with a 2nd–3rd grader over video, 30 minutes twice a week.", link_url: "/opportunities?q=reading", placement: "right", expires_at: new Date(Date.now() + 30 * day).toISOString() },
      { title: "Paused sponsor ad", body: "Turned off by an admin; never shown.", placement: "right", is_active: false },
      { title: "Last month's campaign", body: "Expired; never shown.", placement: "left", expires_at: new Date(Date.now() - day).toISOString() }
    ];
    for (const ad of ads) await call(E.admin, "POST", "/v1/admin/ads", ad);

    console.log("UAT scenarios loaded (S1–S13). See docs/uat/README.md.");
  } finally {
    // Audit-log rows are written just after each admin response; let them land before closing.
    await new Promise((r) => setTimeout(r, 1000));
    server.close();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
