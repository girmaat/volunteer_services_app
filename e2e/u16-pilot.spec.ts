import { api, createUser, db, expect, expectAccessible, PERSONAS, postRequest, run, signedIn, submit, test, uniq } from "./support";

const ageDate = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
};

// U16 · Pilot rules end to end: a 17-year-old volunteers with a verified organization. A guardian
// consents from an emailed link, the teen checks in and out with the on-site code, and the
// organization approves the hours (SAFE-01/04, FORM-03, CON-04/05).
test("U16 minor with guardian consent, QR check-in and hours approval", async ({ browser }) => {
  const teen = await createUser({ name: `Tia${run} Teen`, roles: ["volunteer"], birthDate: ageDate(17) });
  const title = uniq("Pack lunch kits");
  const id = await postRequest(PERSONAS.orgAdmin, { title, startsAt: new Date(Date.now() + 30 * 60_000).toISOString(), durationMinutes: 120 }, "org", {
    orgSlug: "harbor-food-bank",
    requiresGuardianConsent: true
  });
  const applied = await api(teen.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "I'd like to help." });
  await api(PERSONAS.orgAdmin, "POST", `/v1/requests/${id}/applicants/${applied.applicationId}`, { action: "accept" });

  // The organizer sees an under-18 volunteer whose contact stays hidden, and what's missing.
  const org = await signedIn(browser, PERSONAS.orgAdmin);
  await org.page.goto(`/org/requests/${id}/applications`);
  const card = org.page.getByRole("listitem").filter({ hasText: `Tia${run}` });
  await expect(card).toContainText("Under 18");
  await expect(card).toContainText("Before check-in: Consent from a parent or guardian");

  // The teen asks a parent; the parent consents on the emailed page (no account).
  const t = await signedIn(browser, teen.email);
  await t.page.goto(`/volunteer/applications/${applied.applicationId}`);
  const panel = t.page.locator("#prerequisites");
  await expect(panel.getByRole("heading", { name: "Before your shift" })).toBeVisible();
  await panel.getByLabel("Their name").fill("Pat Parent");
  await panel.getByLabel("Their email").fill(`pat.${run}@example.org`);
  await submit(t.page, panel.getByRole("button", { name: "Ask for consent" }));
  await expect(t.page.getByText(/We emailed your parent or guardian/)).toBeVisible();
  const consentUrl = await t.page.getByRole("link", { name: /\/guardian\/consent\// }).getAttribute("href");
  const guardianCtx = await browser.newContext();
  const g = await guardianCtx.newPage();
  await g.goto(consentUrl!.replace(/^https?:\/\/[^/]+/, ""));
  await expect(g.getByRole("heading", { level: 1 })).toContainText("would like to volunteer with Harbor Food Bank");
  await expectAccessible(g, "/guardian/consent/[token]");
  await g.getByLabel(/parent or legal guardian/).check();
  await submit(g, g.getByRole("button", { name: "I give consent" }));
  await expect(g.getByText(/Thank you\. You gave consent/)).toBeVisible();
  await guardianCtx.close();

  // Staff show the check-in code; the teen scans it and checks in and out on their phone.
  await org.page.goto(`/org/requests/${id}`);
  await submit(org.page, org.page.getByRole("button", { name: "Show check-in code" }));
  await expect(org.page.getByRole("img", { name: "Check-in code for this request" })).toBeVisible();
  const checkinUrl = (await org.page.locator("#checkin p.break-all").textContent())!.trim();
  await t.page.goto(checkinUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expectAccessible(t.page, "/check-in/[token]");
  await submit(t.page, t.page.getByRole("button", { name: "Check in now" }));
  await expect(t.page.getByText(/Checked in at/)).toBeVisible();
  await db.query("UPDATE org_attendance_logs SET check_in_at = check_in_at - INTERVAL '90 minutes' WHERE volunteer_user_id = $1", [teen.id]);
  await submit(t.page, t.page.getByRole("button", { name: "Check out" }));
  await expect(t.page.getByText(/Your hours went to the organizer for approval/)).toBeVisible();

  // The organization approves the scanned hours; they count on the teen's Impact page.
  await org.page.goto("/org/hours");
  await expectAccessible(org.page, "/org/hours");
  const entry = org.page.getByRole("listitem").filter({ hasText: title });
  await expect(entry).toContainText("Volunteer scanned the on-site check-in code");
  await submit(org.page, entry.getByRole("button", { name: /^Approve 1\.5 h$/ }));
  await expect(org.page.getByText(/Approved\. It now counts/)).toBeVisible();
  await t.page.goto("/volunteer/history");
  await expect(t.page.locator("main")).toContainText(/Approved hours\s*1\.5/);
});
