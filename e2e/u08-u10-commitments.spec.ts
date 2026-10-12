import { api, createUser, db, expect, postRequest, run, runJob, signedIn, submit, test, uniq } from "./support";

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

/** Owner accepts (and optionally confirms the schedule for) an applicant through the API. */
async function ownerAct(owner: string, requestId: string, appId: string, action: string, extra: Record<string, unknown> = {}) {
  return api(owner, "POST", `/v1/requests/${requestId}/applicants/${appId}`, { action, ...extra });
}

// U8 · Volunteer: confirm attendance from the reminder; add to calendar (ICS); cancel late →
// the waitlisted volunteer is promoted.
test("U8 reminder → confirm attendance, ICS, late cancel offers the spot to the waitlist", async ({ browser }) => {
  const owner = await createUser({ name: "Paula Owner", roles: ["requester"] });
  const ada = await createUser({ name: `Ada${run} Early`, roles: ["volunteer"] });
  const bo = await createUser({ name: `Bo${run} Waiting`, roles: ["volunteer"] });
  const title = uniq("Help at a garage sale");
  const start = inHours(48);
  const id = await postRequest(owner.email, { title, startsAt: start, volunteersNeeded: 1 });
  const a = await api(ada.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "Count me in." });
  const b = await api(bo.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "Happy to help too." });
  await ownerAct(owner.email, id, a.applicationId, "accept");
  await ownerAct(owner.email, id, a.applicationId, "confirm", { startAt: start });
  await ownerAct(owner.email, id, b.applicationId, "waitlist");

  // The 48-hour reminder goes out (email + in-app) and links to the application.
  await runJob("reminders.attendance");
  const email = await db.query("SELECT subject FROM email_log WHERE user_id = $1 AND type = 'attendance_reminder'", [ada.id]);
  expect(email.rows.map((r) => r.subject).join()).toContain(title);

  const v = await signedIn(browser, ada.email);
  // From the bell: the menu lists it unread; opening it deep-links and marks it read.
  await v.page.goto("/volunteer/dashboard");
  await v.page.getByRole("button", { name: /Notifications, \d+ unread/ }).click();
  await v.page.getByRole("menuitem", { name: new RegExp(`${title}.*starts in 2 days`) }).click();
  await expect(v.page).toHaveURL(new RegExp(`/volunteer/applications/${a.applicationId}`));
  const read = await db.query("SELECT read_at FROM notifications WHERE user_id = $1 AND type = 'attendance_reminder'", [ada.id]);
  expect(read.rows[0].read_at).toBeTruthy();
  await submit(v.page, v.page.getByRole("button", { name: "I'm still coming" }));
  await expect(v.page.getByText("Thanks for confirming").first()).toBeVisible();

  // Add to calendar.
  const ics = v.page.getByRole("link", { name: /Add to calendar/ });
  const res = await v.page.request.get((await ics.getAttribute("href"))!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain(title.slice(0, 30));

  // The day before it starts, plans change: inside 24 h it is a late cancellation.
  const soon = inHours(5);
  await db.query("UPDATE service_requests SET starts_at = $2 WHERE id = $1", [id, soon]);
  await db.query("UPDATE request_commitments SET start_at = $2 WHERE request_id = $1", [id, soon]);
  await v.page.reload();
  await expect(v.page.getByText(/late cancellation/)).toBeVisible();
  await v.page.getByLabel("A short note for the organizer (optional)").fill("Sorry, a family emergency.");
  await submit(v.page, v.page.getByRole("button", { name: "Cancel my spot" }));
  await expect(v.page.getByText(/You've canceled/).first()).toBeVisible();
  const late = await db.query("SELECT late_cancel FROM request_commitments WHERE request_id = $1 AND volunteer_user_id = $2 ORDER BY updated_at DESC LIMIT 1", [id, ada.id]);
  expect(late.rows[0].late_cancel).toBe(true);

  // Bo is offered the spot (never placed without saying yes) and takes it.
  const w = await signedIn(browser, bo.email);
  await w.page.goto(`/volunteer/applications/${b.applicationId}`);
  await expect(w.page.getByText("A spot opened up. Do you want it?")).toBeVisible();
  await submit(w.page, w.page.getByRole("button", { name: "Yes, I'll take it" }));
  await expect(w.page.getByText("The spot is yours.")).toBeVisible();
  await expect(w.page.locator("main")).toContainText("Accepted");
});

// U9 · Both: mark complete; both leave structured reviews; reviews appear only after both submit.
test("U9 complete, double-blind reviews appear only when both are in", async ({ browser }) => {
  const owner = await createUser({ name: `Rhea${run} Owner`, roles: ["requester"] });
  const vol = await createUser({ name: `Sol${run} Helper`, roles: ["volunteer"] });
  const title = uniq("Paint a fence");
  const id = await postRequest(owner.email, { title, startsAt: inHours(30) });
  const a = await api(vol.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "I paint." });
  await ownerAct(owner.email, id, a.applicationId, "accept");
  await db.query("UPDATE service_requests SET starts_at = NOW() - INTERVAL '3 hours' WHERE id = $1", [id]);

  // The requester marks it complete from the applicants list.
  const o = await signedIn(browser, owner.email);
  await o.page.goto(`/requester/requests/${id}/applications`);
  const card = o.page.getByRole("listitem").filter({ hasText: `Sol${run}` }).first();
  await submit(o.page, card.getByRole("button", { name: "Mark complete" }));
  await expect(o.page.getByText(/Marked complete/).first()).toBeVisible();

  const stars = async (page: typeof o.page, group: string, n: number) => page.getByRole("group", { name: new RegExp(`^${group}`) }).getByText(String(n), { exact: true }).click();

  // Volunteer reviews first.
  const v = await signedIn(browser, vol.email);
  await v.page.goto(`/volunteer/applications/${a.applicationId}`);
  await stars(v.page, "Overall", 5);
  await stars(v.page, "Reliability", 4);
  await stars(v.page, "Clear instructions", 5);
  await v.page.getByLabel(/Comment/).fill("Clear plan and all the supplies were ready.");
  await submit(v.page, v.page.getByRole("button", { name: "Submit review" }));
  await expect(v.page.getByText("Review saved.").first()).toBeVisible();
  await expect(v.page.getByText(/review of you:/)).toHaveCount(0);

  // The requester sees only that a review exists, until theirs is in.
  await o.page.goto(`/requester/requests/${id}/applications`);
  await expect(o.page.getByText(/has reviewed you/)).toBeVisible();
  await expect(o.page.getByText("Clear plan and all the supplies")).toHaveCount(0);
  await stars(o.page, "Overall", 5);
  await stars(o.page, "Skill for the task", 5);
  await o.page.getByLabel(/Comment/).fill("Careful, tidy work.");
  await submit(o.page, o.page.getByRole("button", { name: "Submit review" }));
  await expect(o.page.getByText(/review of you: 5\/5/)).toBeVisible();
  await expect(o.page.getByText("Clear plan and all the supplies were ready.")).toBeVisible();

  await v.page.reload();
  await expect(v.page.getByText(/review of you: 5\/5/)).toBeVisible();
  await expect(v.page.getByText("Careful, tidy work.")).toBeVisible();
});

// U10 · Volunteer and organizer: hours wait for approval; approved hours show on Impact, on a
// shareable record anyone can check, and in the CSV (CON-05, REC-01/02/03).
test("U10 hours wait for approval, then count on Impact, a verified record and the CSV", async ({ browser }) => {
  const owner = await createUser({ name: "Iris Owner", roles: ["requester"] });
  const vol = await createUser({ name: `Ian${run} Impact`, roles: ["volunteer"] });
  const title = uniq("Sort a little free library");
  const id = await postRequest(owner.email, { title, startsAt: inHours(30), durationMinutes: 120 });
  const a = await api(vol.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "Love books." });
  await ownerAct(owner.email, id, a.applicationId, "accept");
  await db.query("UPDATE service_requests SET starts_at = NOW() - INTERVAL '1 day' WHERE id = $1", [id]);
  await ownerAct(owner.email, id, a.applicationId, "complete");

  // Marked complete: the scheduled time waits for the organizer's approval and doesn't count yet.
  const v = await signedIn(browser, vol.email);
  await v.page.goto("/volunteer/history");
  await expect(v.page.getByRole("heading", { name: "Your volunteering" })).toBeVisible();
  const item = v.page.getByRole("listitem").filter({ has: v.page.getByRole("heading", { name: title }) });
  await expect(item).toContainText("2 h reported");
  await expect(item).toContainText("Waiting for approval");

  // The volunteer reports extra time.
  await item.getByText("Report time you gave").click();
  await item.getByLabel("or hours").fill("1.5");
  await item.getByLabel("What did you do?").fill("Shelved 40 books after closing.");
  await submit(v.page, item.getByRole("button", { name: "Send for approval" }));
  await expect(v.page.getByText(/Sent for approval/)).toBeVisible();

  // The organizer approves one and approves the other with a change and a note.
  const o = await signedIn(browser, owner.email);
  await o.page.goto("/requester/hours");
  await expect(o.page.getByRole("heading", { name: "Volunteer hours" })).toBeVisible();
  const entries = o.page.getByRole("listitem").filter({ hasText: title });
  await expect(entries).toHaveCount(2);
  await submit(o.page, entries.filter({ hasText: "Marked complete" }).getByRole("button", { name: "Approve 2 h" }));
  await expect(o.page.getByText(/Approved\. It now counts/)).toBeVisible();
  const extra = o.page.getByRole("listitem").filter({ hasText: "Shelved 40 books" });
  await extra.getByText("Change, send back or decline").click();
  await extra.getByLabel("Hours to approve").fill("1");
  await extra.getByLabel("Note for the volunteer").fill("We closed at 6, so one hour.");
  await submit(o.page, extra.getByRole("button", { name: "Approve with this change" }));
  await expect(o.page.getByText(/Saved with your change/)).toBeVisible();

  // Only approved hours count; the volunteer sees the note.
  await v.page.goto("/volunteer/history");
  await expect(v.page.locator("main")).toContainText(/Approved hours\s*3(?!\d)/);
  await expect(item).toContainText("Reviewer’s note: We closed at 6, so one hour.");

  // A record to share: preview exactly what's shown, confirm, then anyone with the link can check it.
  await v.page.goto("/volunteer/records/new");
  await submit(v.page, v.page.getByRole("button", { name: "Preview" }));
  await expect(v.page.getByRole("heading", { name: "Check what they’ll see" })).toBeVisible();
  await expect(v.page.getByRole("table")).toContainText(title);
  await v.page.getByRole("checkbox", { name: /I want to share this/ }).check();
  await submit(v.page, v.page.getByRole("button", { name: "Create link" }));
  await expect(v.page.getByText("Record ready.")).toBeVisible();
  const recordUrl = await v.page.getByLabel("Record link").inputValue();
  const anon = await browser.newContext();
  const pub = await anon.newPage();
  await pub.goto(recordUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expect(pub.getByText("Valid record, issued by ThankYou")).toBeVisible();
  await expect(pub.getByRole("table")).toContainText(title);
  // Turning the link off leaves nothing to see.
  await submit(v.page, v.page.getByRole("button", { name: "Turn off link" }));
  await pub.reload();
  await expect(pub.getByRole("heading", { name: "This record was turned off" })).toBeVisible();
  await expect(pub.getByRole("table")).toHaveCount(0);
  await anon.close();

  // The CSV keeps each entry with its status.
  await v.page.goto("/volunteer/history");
  const href = await v.page.getByRole("link", { name: /CSV/ }).getAttribute("href");
  const res = await v.page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const csv = await res.text();
  expect(csv.split("\n")[0]).toMatch(/date.*status.*approved_hours/i);
  expect(csv).toContain(title);
  expect(csv).toContain("approved (adjusted)");
});
