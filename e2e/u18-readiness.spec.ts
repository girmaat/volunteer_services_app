import { api, createUser, expect, PERSONAS, postRequest, signedIn, submit, test, uniq } from "./support";

// U18 · Evidence on a contribution: the volunteer attaches a link to hours they reported, and the
// person who reviews those hours sees it next to the hours.
test("U18 volunteer adds evidence to reported hours; the reviewer sees it", async ({ browser }) => {
  const poster = await createUser({ name: "Petra Poster", roles: ["requester"] });
  const volunteer = await createUser({ name: "Evan Evidence", roles: ["volunteer"] });
  const title = uniq("Translate a flyer");
  const requestId = await postRequest(poster.email, { title, mode: "remote", publicArea: "", exactAddress: "" });

  const applied = await api(volunteer.email, "POST", `/v1/volunteer/opportunities/${requestId}/apply`, { message: "Happy to help with this." });
  await api(poster.email, "POST", `/v1/requests/${requestId}/applicants/${applied.applicationId}`, { action: "accept" });
  await api(volunteer.email, "POST", "/v1/volunteer/contributions", { applicationId: applied.applicationId, hours: 2, description: "Translated both pages." });

  const v = await signedIn(browser, volunteer.email);
  await v.page.goto("/volunteer/history");
  await v.page.getByText("Add evidence").first().click();
  await v.page.getByLabel("Link").first().fill("https://example.org/translated-flyer");
  await v.page.getByLabel(/^Label/).first().fill("Translated flyer");
  await submit(v.page, v.page.getByRole("button", { name: "Add", exact: true }).first());
  await expect(v.page).toHaveURL(/flash=evidence/);
  await expect(v.page.getByRole("link", { name: "Translated flyer" })).toBeVisible();

  const p = await signedIn(browser, poster.email);
  await p.page.goto("/requester/hours");
  const link = p.page.getByRole("link", { name: "Translated flyer" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("rel", /noopener/);
});

// The organization type is set in Organization settings and by platform admins; school coordinators
// are offered on the team page only for schools.
test("U18 organization type: settings, team roles and the admin list", async ({ browser }) => {
  const o = await signedIn(browser, PERSONAS.orgAdmin);
  await o.page.goto("/org/settings");
  await expect(o.page.getByLabel(/Type of organization/)).toBeVisible();
  await o.page.goto("/org/team");
  await expect(o.page.locator('select[name="role"] option[value="coordinator"]')).toHaveCount(0);

  const a = await signedIn(browser, PERSONAS.admin);
  await a.page.goto("/admin/organizations");
  await expect(a.page.locator("th", { hasText: /^Type$/ })).toBeVisible();
  await expect(a.page.locator(`select[name="org_type"]`).first()).toBeVisible();
});
