import { api, createUser, db, expect, PASSWORD, run, signedIn, submit, test, uniq, uniqEmail } from "./support";

// U11 · Org admin: sign up an org, submit verification, invite a team member, post a recurring
// request, take attendance, export the roster.
test("U11 org admin: sign up, verify, invite, recurring request, attendance, roster", async ({ page, browser }) => {
  const slug = `riverside-${run}`;
  const orgName = `Riverside Mutual Aid ${run}`;
  await page.goto("/org/signup");
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByLabel(/Organization slug/).fill(slug);
  await page.getByLabel("Summary").fill("Neighbors helping neighbors along the river.");
  await page.getByLabel("Location").fill("Astoria, Queens, NY");
  await page.getByLabel(/Contact email/).fill(`hello.${run}@example.test`);
  await page.getByLabel("Full name").fill("Riley Admin");
  await page.getByLabel("Admin email").fill(uniqEmail("riley"));
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create org account" }).click();
  const verify = page.locator('a[href*="verify-email?token="]').first();
  await expect(verify).toBeVisible();
  await page.goto((await verify.getAttribute("href"))!);
  await expect(page).toHaveURL(/\/onboarding/); // verifying signs you in

  // Onboarding: admin contact, then the organization profile.
  await page.goto("/org/onboarding/admin");
  await page.getByLabel("Full name").fill("Riley Admin");
  await page.getByLabel("Phone").fill("718-555-0100");
  await page.getByRole("button", { name: "Save admin profile" }).click();
  await expect(page.getByRole("heading", { name: "Organization profile" })).toBeVisible();
  await page.getByRole("button", { name: "Save organization profile" }).click();
  await page.getByRole("button", { name: "Finish onboarding" }).click();
  await expect(page).toHaveURL(/\/org\/dashboard/);
  await expect(page.getByRole("heading", { name: "Finish setting up" })).toBeVisible();

  // Verification.
  await page.goto("/org/settings");
  await page.getByLabel(/Notes for the reviewer/).fill(`EIN 12-${run.slice(-7)}; website riverside.example.org`);
  await page.getByRole("button", { name: "Submit for verification" }).click();
  await expect(page.getByRole("button", { name: "Update submission" })).toBeVisible();

  // Invite a teammate.
  await page.goto("/org/team");
  await page.getByLabel("Email").fill(uniqEmail("teammate"));
  await page.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText("Invite sent.")).toBeVisible();

  // A recurring request through the org wizard (Saturdays and Sundays).
  const title = uniq("Weekend riverbank clean-up");
  await page.goto("/org/requests/new");
  await page.getByLabel("Title").fill(title);
  await page.locator("#w-cat").selectOption("events");
  await page.locator("#w-desc").fill("Pick up litter along the river path. Gloves and bags provided.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="scheduleType"][value="recurring"]').check();
  const d = new Date(Date.now() + 3 * 86400_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  await page.locator("#w-start").fill(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T09:00`);
  for (const day of ["SA", "SU"]) await page.locator(`input[name="days"][value="${day}"]`).check();
  await page.locator("#w-dur").fill("120");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="mode"][value="in-person"]').check();
  await page.locator("#w-area").fill("Astoria Park, Queens, NY");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Sat.*Sun|Saturdays?/).first()).toBeVisible();
  await page.getByRole("button", { name: "Publish request" }).click();
  await expect(page).toHaveURL(/\/org\/requests\/[0-9a-f-]{36}/);
  const requestId = page.url().match(/requests\/([0-9a-f-]{36})/)![1];

  // A volunteer applies; the org accepts, checks them in and out.
  const vol = await createUser({ name: `Tess${run} Volunteer`, roles: ["volunteer"] });
  const applied = await api(vol.email, "POST", `/v1/volunteer/opportunities/${requestId}/apply`, { message: "Weekends work for me." });
  await page.goto(`/org/requests/${requestId}/applications`);
  const card = page.getByRole("listitem").filter({ hasText: `Tess${run}` }).first();
  await submit(page, card.getByRole("button", { name: "Accept" }));
  await expect(card).toContainText("Accepted");
  await submit(page, card.getByRole("button", { name: "Check in" }));
  await expect(card).toContainText("Checked in");
  await submit(page, card.getByRole("button", { name: "Check out" }));
  await expect(card.getByRole("button", { name: "Check in" })).toBeVisible();
  const log = await db.query("SELECT check_out_at FROM org_attendance_logs WHERE request_application_id = $1", [applied.applicationId]);
  expect(log.rows[0]?.check_out_at).toBeTruthy();

  await page.goto(`/org/attendance?requestId=${requestId}`);
  await expect(page.locator("main")).toContainText(`Tess${run}`);

  // Export the roster.
  await page.goto("/org/roster");
  const exportHref = await page.getByRole("link", { name: /export/i }).first().getAttribute("href");
  const res = await page.request.get(exportHref!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(await res.text()).toContain(`Tess${run}`);
  void browser;
});

// U12 · Dual-role user: switch from Volunteer to Requester without logging out; the right nav
// and data in each.
test("U12 dual-role user switches context without logging out", async ({ browser }) => {
  const diego = await createUser({ name: `Dee${run} Dual`, roles: ["volunteer", "requester"] });
  const title = uniq("Dual role: borrow a ladder");
  const draft = await api(diego.email, "POST", "/v1/requests", {
    as: "requester", title, category: "errands", description: "Need a ladder for an afternoon.", volunteersNeeded: 1, urgency: "normal",
    scheduleType: "one_time", timezone: "America/New_York", startsAt: new Date(Date.now() + 4 * 86400_000).toISOString(), durationMinutes: 60,
    mode: "in-person", publicArea: "Astoria, Queens, NY"
  });
  await api(diego.email, "POST", `/v1/requests/${draft.id}/transition`, { event: "publish" });
  const { page } = await signedIn(browser, diego.email);
  await page.goto("/volunteer/dashboard");
  const nav = () => page.getByRole("complementary", { name: "Sidebar" }).getByRole("navigation");
  await expect(nav().getByRole("link", { name: "Find opportunities" })).toBeVisible();
  await expect(nav().getByRole("link", { name: "My requests" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Acting as Volunteering/ }).click();
  await page.getByRole("menuitem", { name: /Requesting help/ }).click();
  await expect(page).toHaveURL(/\/requester\/dashboard/);
  await expect(page.getByRole("button", { name: /^Acting as Requesting help/ })).toBeVisible();
  await expect(nav().getByRole("link", { name: "My requests" })).toBeVisible();
  await expect(nav().getByRole("link", { name: "Find opportunities" })).toHaveCount(0);
  await nav().getByRole("link", { name: "My requests" }).click();
  await expect(page.getByText(title)).toBeVisible();

  // Shared screens follow the active context, and it survives a reload.
  await page.goto("/settings");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Acting as Requesting help/ })).toBeVisible();

  await page.getByRole("button", { name: /^Acting as Requesting help/ }).click();
  await page.getByRole("menuitem", { name: /Volunteering/ }).click();
  await expect(page).toHaveURL(/\/volunteer\/dashboard/);
});
