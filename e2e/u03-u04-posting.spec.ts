import { createUser, expect, signedIn, test, uniq } from "./support";
import type { Page } from "@playwright/test";

const nextWeekLocal = () => {
  const d = new Date(Date.now() + 7 * 86400_000);
  d.setHours(10, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T10:00`;
};

/** Walks the five-step posting wizard. Each step is a full page load (plain form posts). */
async function postThroughWizard(page: Page, opts: { title: string; category: string; description: string; area: string; address: string }) {
  await page.goto("/requester/requests/new");
  await expect(page.getByText("Not for urgent or life-threatening needs")).toBeVisible();
  await page.getByLabel("Title").fill(opts.title);
  await page.locator("#w-cat").selectOption(opts.category);
  await page.locator("#w-desc").fill(opts.description);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("#w-start")).toBeVisible();
  await page.locator('input[name="scheduleType"][value="one_time"]').check();
  await page.locator("#w-start").fill(nextWeekLocal());
  await page.locator("#w-dur").fill("90");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("#w-area")).toBeVisible();
  await page.locator('input[name="mode"][value="in-person"]').check();
  await page.locator("#w-area").fill(opts.area);
  await page.locator("#w-addr").fill(opts.address);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator('input[name="requiresCar"]')).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /review/i }).or(page.getByText("Before publishing")).or(page.getByRole("button", { name: /Publish request|Submit for review/ })).first()).toBeVisible();
}

// U3 · Individual requester: post a one-time in-person request through the wizard; see it live; edit it.
test("U3 requester posts a one-time in-person request, sees it live and edits it", async ({ browser }) => {
  const rose = await createUser({ name: "Rosa Poster", roles: ["requester"] });
  const { page } = await signedIn(browser, rose.email);
  const title = uniq("Assemble a bookshelf");
  await postThroughWizard(page, { title, category: "errands", description: "Flat-pack bookshelf, about an hour with two people. I have the tools.", area: "Upper West Side, Manhattan, NY", address: "200 W 90th St, Apt 5C" });

  await page.getByRole("button", { name: "Publish request" }).click();
  await expect(page).toHaveURL(/\/requester\/requests\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText("Your request is live").first()).toBeVisible();
  const detailUrl = page.url().split("?")[0];

  // Edit: rename it and save from step 1.
  await page.getByRole("link", { name: "Edit" }).click();
  const renamed = `${title} (two shelves)`;
  await page.getByLabel("Title").fill(renamed);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved.")).toBeVisible();
  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(renamed);

  // It is discoverable.
  await page.goto(`/opportunities?q=${encodeURIComponent(renamed)}`);
  await expect(page.getByRole("link", { name: renamed })).toBeVisible();
});

// U4 · Requester posts a sensitive request (home access); it waits for admin approval; admin
// approves; (trusted) volunteers see it.
test("U4 sensitive request waits for a moderator, then trusted volunteers see it", async ({ browser }) => {
  const poster = await createUser({ name: "Hana Verified", roles: ["requester"], trusted: true });
  const trustedVol = await createUser({ name: "Theo Trusted", roles: ["volunteer"], trusted: true });
  const basicVol = await createUser({ name: "Bea Basic", roles: ["volunteer"] });
  const title = uniq("Let a volunteer in to water plants");

  const { page } = await signedIn(browser, poster.email);
  await postThroughWizard(page, { title, category: "home-access", description: "I'm away for a week; plants need watering twice. Keys with the doorman.", area: "Astoria, Queens, NY", address: "25-15 31st Ave, Apt 3R" });
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText(/review/i).first()).toBeVisible();

  // Not discoverable yet, even for a trusted volunteer.
  const trusted = await signedIn(browser, trustedVol.email);
  await trusted.page.goto(`/volunteer/opportunities/recommended?q=${encodeURIComponent(title)}`);
  await expect(trusted.page.getByRole("link", { name: title })).toHaveCount(0);

  // A moderator approves it.
  const mod = await signedIn(browser, "moderator@thankyou.test");
  await mod.page.goto("/admin/moderation");
  const item = mod.page.locator("article, li, section").filter({ has: mod.page.getByRole("heading", { name: title }) }).first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Approve" }).click();
  await expect(mod.page.getByRole("heading", { name: title })).toHaveCount(0);

  // Trusted volunteers see it; basic ones don't.
  await trusted.page.goto(`/volunteer/opportunities/recommended?q=${encodeURIComponent(title)}`);
  await expect(trusted.page.getByRole("link", { name: title })).toBeVisible();
  const basic = await signedIn(browser, basicVol.email);
  await basic.page.goto(`/volunteer/opportunities/recommended?q=${encodeURIComponent(title)}`);
  await expect(basic.page.getByRole("region", { name: "Results" })).toBeVisible();
  await expect(basic.page.getByRole("link", { name: title })).toHaveCount(0);
});
