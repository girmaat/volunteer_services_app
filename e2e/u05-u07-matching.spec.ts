import { api, createUser, expect, postRequest, run, signedIn, submit, test, uniq } from "./support";

/** A start time inside the app's "This weekend" window (mirrors FindOpportunities' dateRange). */
function thisWeekendStart(): string {
  const now = new Date();
  const dow = now.getUTCDay();
  const utcDay = (add: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add));
  if (dow === 6 || dow === 0) {
    const end = utcDay(dow === 6 ? 2 : 1).getTime();
    return new Date(now.getTime() + Math.max(20 * 60_000, (end - now.getTime()) / 2)).toISOString();
  }
  const sat = utcDay(6 - dow);
  return new Date(sat.getTime() + 15 * 3600_000).toISOString();
}

// U5 · Volunteer: search and filter (remote, skill, this weekend); save; apply with a message.
test("U5 volunteer filters by remote, skill and this weekend, saves and applies", async ({ browser }) => {
  const owner = await createUser({ name: "Omar Owner", roles: ["requester"] });
  const vol = await createUser({ name: "Vic Searcher", roles: ["volunteer"], skills: ["writing"] });
  const skill = `calligraphy${run}`;
  const title = uniq("Hand-letter thank-you cards");
  const remoteId = await postRequest(owner.email, { title, mode: "remote", publicArea: "", exactAddress: "", requiredSkills: skill, startsAt: thisWeekendStart(), category: "events" });
  // Same skill, but in person: the Remote tab must leave it out.
  const inPersonTitle = uniq("Letter a shop window");
  await postRequest(owner.email, { title: inPersonTitle, mode: "in-person", requiredSkills: skill, startsAt: thisWeekendStart(), category: "events" });

  const { page } = await signedIn(browser, vol.email);
  await page.goto("/volunteer/opportunities/remote");
  await page.getByLabel("Search").fill(skill); // matches the request's skills, not its title
  await page.getByLabel("When").selectOption("weekend");
  await page.getByRole("button", { name: "Show results" }).click();
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("link", { name: title })).toBeVisible();
  await expect(results.getByRole("link", { name: inPersonTitle })).toHaveCount(0);

  await results.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await submit(page, page.getByRole("button", { name: "Save for later" }));
  await expect(page.getByText("Saved to your list.")).toBeVisible();
  await page.goto("/volunteer/opportunities/saved");
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  await page.goto(`/volunteer/opportunities/${remoteId}`);
  await page.getByLabel("Message to the organizer").fill("I've done lettering for weddings and can work this weekend.");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Application sent.")).toBeVisible();
  await page.goto("/volunteer/applications");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

// U6 · Requester: review applicants; accept two, waitlist one; request becomes Filled; the exact
// address is revealed to accepted volunteers only.
test("U6 requester accepts two, waitlists one; Filled; address only for the accepted", async ({ browser }) => {
  const owner = await createUser({ name: "Grace Owner", roles: ["requester"] });
  const title = uniq("Move a couch down two flights");
  const address = `41-12 ${run} Ave, Apt 4`;
  const id = await postRequest(owner.email, { title, volunteersNeeded: 2, exactAddress: address });
  const vols = [];
  for (const n of ["Ann", "Ben", "Cal"]) {
    const v = await createUser({ name: `${n}${run} Helper`, roles: ["volunteer"] });
    const out = await api(v.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: `${n} here, I can lift.` });
    vols.push({ ...v, display: `${n}${run}`, appId: String(out.applicationId) });
  }

  const { page } = await signedIn(browser, owner.email);
  await page.goto(`/requester/requests/${id}/applications`);
  const card = (name: string) => page.getByRole("listitem").filter({ hasText: name }).first();
  await card(vols[0].display).getByRole("button", { name: "Accept" }).click();
  await expect(card(vols[0].display)).toContainText("Accepted");
  await card(vols[1].display).getByRole("button", { name: "Accept" }).click();
  await expect(card(vols[1].display)).toContainText("Accepted");
  await card(vols[2].display).getByRole("button", { name: "Waitlist" }).click();
  await expect(card(vols[2].display)).toContainText(/Waitlist/);
  await expect(page.getByText("2 of 2 spots filled")).toBeVisible();

  await page.goto(`/requester/requests/${id}`);
  await expect(page.locator("main")).toContainText("Filled");

  for (const [v, sees] of [[vols[0], true], [vols[1], true], [vols[2], false]] as const) {
    const s = await signedIn(browser, v.email);
    await s.page.goto(`/volunteer/applications/${v.appId}`);
    await expect(s.page.getByRole("heading", { level: 1 })).toHaveText(title);
    if (sees) await expect(s.page.locator("main")).toContainText(address);
    else await expect(s.page.locator("main")).not.toContainText(address);
    await s.context.close();
  }
});

// U7 · Volunteer + requester: message in the thread; contact details masked before acceptance;
// report and block from the thread.
test("U7 contact details are masked before acceptance; report and block from the thread", async ({ browser }) => {
  const owner = await createUser({ name: "Nina Owner", roles: ["requester"] });
  const vol = await createUser({ name: `Max${run} Messenger`, roles: ["volunteer"] });
  const title = uniq("Help set up a printer");
  const id = await postRequest(owner.email, { title, category: "tech" });
  const applied = await api(vol.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "Happy to help with the printer." });

  const v = await signedIn(browser, vol.email);
  await v.page.goto(`/volunteer/applications/${applied.applicationId}`);
  await v.page.getByRole("link", { name: "Message" }).click();
  await expect(v.page).toHaveURL(/\/inbox\/[0-9a-f-]{36}/);
  const threadUrl = v.page.url();
  await v.page.getByLabel("Message", { exact: true }).fill("Text me at 917-555-0123 or max.helper@example.org to sort out a time.");
  await v.page.getByRole("button", { name: "Send" }).click();
  await expect(v.page.getByRole("list", { name: "Messages" }).getByText(/Text me at/)).toBeVisible();

  const o = await signedIn(browser, owner.email);
  await o.page.goto(threadUrl);
  await expect(o.page.getByRole("list", { name: "Messages" }).getByText(/Text me at/)).toBeVisible();
  const thread = await o.page.locator("main").innerText();
  expect(thread).not.toContain("917-555-0123");
  expect(thread).not.toContain("max.helper@example.org");
  expect(thread).toContain("hidden until");

  // Report, then block, from the thread's Safety menu.
  await o.page.getByText("Safety", { exact: true }).click();
  await o.page.getByLabel("Report a concern").selectOption("harassment");
  await o.page.getByLabel("What happened? (optional)").fill("Pushing to move off the platform.");
  await o.page.getByRole("button", { name: "Send report" }).click();
  await expect(o.page.getByText(/our team will review this conversation/)).toBeVisible();
  await o.page.getByText("Safety", { exact: true }).click();
  await o.page.getByRole("button", { name: /^Block / }).click();
  await expect(o.page.getByText(/^Blocked\./)).toBeVisible();
  await expect(o.page.getByRole("button", { name: "Send" })).toHaveCount(0);
});
