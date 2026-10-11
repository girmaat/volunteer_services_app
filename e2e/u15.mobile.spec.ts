import { signUpAndOnboardVolunteer } from "./flows";
import { api, createUser, expect, expectNoHorizontalScroll, postRequest, run, signedIn, submit, test, uniq } from "./support";

// U15 · Mobile user: U2, U5 and U7 on a 375 px phone viewport (the "mobile" project).
test.describe("U15 on a 375 px phone", () => {
  test("U2 on a phone: sign up, onboard, see recommendations", async ({ page }) => {
    await signUpAndOnboardVolunteer(page, "Mia Mobile");
    await expect(page).toHaveURL(/\/volunteer\/dashboard/);
    await expectNoHorizontalScroll(page);
    // Bottom tab bar instead of the sidebar.
    const tabs = page.getByRole("navigation", { name: /shortcuts/ });
    await expect(tabs).toBeVisible();
    await tabs.getByRole("link", { name: /Find/ }).click();
    await expect(page).toHaveURL(/\/volunteer\/opportunities/);
    await expect(page.getByRole("region", { name: "Results" }).getByRole("listitem").first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("U5 on a phone: filters fold away, search, save and apply", async ({ browser }) => {
    const owner = await createUser({ name: "Owen Owner", roles: ["requester"] });
    const vol = await createUser({ name: "Moe Mobile", roles: ["volunteer"] });
    const skill = `origami${run}`;
    const title = uniq("Fold paper cranes for a fundraiser");
    const id = await postRequest(owner.email, { title, mode: "remote", publicArea: "", exactAddress: "", requiredSkills: skill, category: "events" });

    const { page } = await signedIn(browser, vol.email, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    await page.goto("/volunteer/opportunities/remote");
    // Results come first; the extra filters sit behind "Filters".
    await expect(page.getByLabel("When")).toBeHidden();
    await page.getByRole("link", { name: /^Filters/ }).click();
    await expect(page.getByLabel("When")).toBeVisible();
    await page.getByLabel("Search").fill(skill);
    await page.getByRole("button", { name: "Show results" }).click();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expectNoHorizontalScroll(page);
    await submit(page, page.getByRole("button", { name: "Save for later" }));
    await expect(page.getByText("Saved to your list.")).toBeVisible();
    await page.getByLabel("Message to the organizer").fill("I fold a mean crane.");
    await submit(page, page.getByRole("button", { name: "Apply" }));
    await expect(page.getByText("Application sent.")).toBeVisible();
    void id;
  });

  test("U7 on a phone: message thread with masking", async ({ browser }) => {
    const owner = await createUser({ name: "Nora Owner", roles: ["requester"] });
    const vol = await createUser({ name: `Mo${run} Phone`, roles: ["volunteer"] });
    const id = await postRequest(owner.email, { title: uniq("Set up a smart speaker"), category: "tech" });
    const applied = await api(vol.email, "POST", `/v1/volunteer/opportunities/${id}/apply`, { message: "Happy to help." });

    const phone = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };
    const v = await signedIn(browser, vol.email, phone);
    await v.page.goto(`/volunteer/applications/${applied.applicationId}`);
    await v.page.getByRole("link", { name: "Message" }).click();
    await expect(v.page).toHaveURL(/\/inbox\/[0-9a-f-]{36}/);
    const thread = v.page.url();
    await v.page.getByLabel("Message", { exact: true }).fill("Call me on 646-555-0177 when you're free.");
    await submit(v.page, v.page.getByRole("button", { name: "Send" }));
    await expect(v.page.getByRole("list", { name: "Messages" }).getByText(/Call me on/)).toBeVisible();
    await expectNoHorizontalScroll(v.page);

    const o = await signedIn(browser, owner.email, phone);
    await o.page.goto(thread);
    await expect(o.page.getByRole("list", { name: "Messages" }).getByText(/Call me on/)).toBeVisible();
    expect(await o.page.locator("main").innerText()).not.toContain("646-555-0177");
    await expectNoHorizontalScroll(o.page);
  });
});
