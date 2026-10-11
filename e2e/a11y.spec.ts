import { api, createUser, db, expect, expectAccessible, PERSONAS, postRequest, signedIn, test, uniq } from "./support";

/**
 * The plan's accessibility gate: the UAT pages have no serious or critical axe violations
 * (WCAG 2.1 A/AA) and never scroll sideways at 375 px.
 */
test("UAT pages pass axe and reflow at 375 px", async ({ browser }) => {
  const owner = await createUser({ name: "Ada Owner", roles: ["requester"] });
  const vol = await createUser({ name: "Val Volunteer", roles: ["volunteer"] });
  const id = await postRequest(owner.email, { title: uniq("Accessibility check: water the garden") });
  const applied = await api(vol.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "Hello!" });
  const convo = await api(vol.email, "GET", `/v1/volunteer/applications/${applied.applicationId}`);
  void convo;
  // Someone part-way through setup, for the onboarding steps.
  const newbie = await createUser({ name: "Nia Newbie", roles: ["volunteer"] });
  await db.query("UPDATE users SET onboarding_completed = FALSE WHERE id = $1", [newbie.id]);

  const pages: [string | null, string][] = [
    [null, "/"],
    [null, "/opportunities"],
    [null, `/opportunities/${id}`],
    [null, "/signup"],
    [null, "/login"],
    [null, "/org/signup"],
    [newbie.email, "/onboarding?step=about"],
    [newbie.email, "/onboarding?step=interests"],
    [newbie.email, "/onboarding?step=schedule"],
    [vol.email, "/volunteer/dashboard"],
    [vol.email, "/volunteer/opportunities/recommended"],
    [vol.email, `/volunteer/applications/${applied.applicationId}`],
    [vol.email, "/inbox"],
    [vol.email, "/onboarding/welcome"],
    [vol.email, "/notifications"],
    [vol.email, "/volunteer/history"],
    [owner.email, "/requester/requests/new"],
    [owner.email, `/requester/requests/${id}/applications`],
    [owner.email, "/settings/account"],
    [PERSONAS.orgAdmin, "/org/dashboard"],
    [PERSONAS.admin, "/admin"]
  ];

  for (const width of [1366, 375]) {
    const sessions = new Map<string | null, Awaited<ReturnType<typeof signedIn>>>();
    for (const [who, path] of pages) {
      if (!sessions.has(who)) {
        if (who) sessions.set(who, await signedIn(browser, who, { viewport: { width, height: 900 } }));
        else {
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          sessions.set(who, { context, page: await context.newPage() });
        }
      }
      const { page } = sessions.get(who)!;
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      if (width === 1366) await expectAccessible(page, path);
      else {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft(overflow, `${path} is ${overflow}px wider than a 375 px screen`).toBeLessThanOrEqual(1);
      }
    }
    for (const s of sessions.values()) await s.context.close();
  }
});
