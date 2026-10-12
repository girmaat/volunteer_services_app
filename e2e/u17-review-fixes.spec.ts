import { currentStep, hotp } from "../apps/api/src/lib/totp";
import { createUser, db, expect, expectAccessible, PASSWORD, postRequest, PERSONAS, run, runJob, signedIn, submit, test, uniq } from "./support";

// U17 · Two-step sign-in (SAFE-05): set it up in Settings → Account, then sign in with a code.
test("U17 two-step sign-in: set up with an authenticator, then sign in with a code", async ({ browser }) => {
  const u = await createUser({ name: `Omar${run} Organizer`, roles: ["volunteer"] });
  const { page } = await signedIn(browser, u.email);
  await page.goto("/settings/account#two-step");
  const box = page.locator("#two-step");
  await box.getByLabel("Confirm your password to start").fill(PASSWORD);
  await submit(page, box.getByRole("button", { name: "Set up two-step sign-in" }));
  await expect(box.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expectAccessible(page, "/settings/account (two-step setup)");
  const secret = (await box.locator("code").innerText()).replace(/\s/g, "");
  await box.getByLabel("6-digit code").fill(hotp(secret, currentStep() - 1));
  await submit(page, box.getByRole("button", { name: "Turn on" }));
  await expect(box.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10);
  await submit(page, box.getByRole("button", { name: "I saved them" }));
  await expect(box).toContainText("On.");

  // A fresh browser: password, then the code.
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto("/login");
  await p2.getByLabel("Email").fill(u.email);
  await p2.getByLabel("Password").fill(PASSWORD);
  await p2.getByRole("button", { name: "Log in" }).click();
  await expect(p2).toHaveURL(/\/login\/code$/);
  await expectAccessible(p2, "/login/code");
  await p2.getByLabel("Code").fill("000000");
  await p2.getByRole("button", { name: "Continue" }).click();
  await expect(p2.getByText(/didn’t work|didn't work/)).toBeVisible();
  await p2.getByLabel("Code").fill(hotp(secret, currentStep()));
  await p2.getByRole("button", { name: "Continue" }).click();
  await expect(p2).not.toHaveURL(/\/login/);
  await ctx.close();
});

// U17 · Saved-search alerts (VOL-03): save a search, a matching request goes live, an alert arrives.
test("U17 saved search alerts about a new matching request", async ({ browser }) => {
  const v = await createUser({ name: `Sana${run} Searcher`, roles: ["volunteer"] });
  const word = `Narwhal${run}`;
  const { page } = await signedIn(browser, v.email);
  await page.goto(`/volunteer/opportunities/recommended?q=${word}`);
  await page.getByLabel("Get alerts for this search").fill(`${word} help`);
  await submit(page, page.getByRole("button", { name: "Save search" }));
  await expect(page.getByText("Search saved.")).toBeVisible();

  await db.query("UPDATE saved_searches SET last_checked_at = NOW() - INTERVAL '2 days' WHERE name = $1", [`${word} help`]);
  await postRequest(PERSONAS.requester, { title: uniq(`${word} garden cleanup`), mode: "remote" });
  await runJob("maintenance.hourly");

  await page.goto("/notifications");
  await expect(page.locator("main")).toContainText(`new for “${word} help”`);
  await page.goto("/volunteer/opportunities/saved#searches");
  await expectAccessible(page, "/volunteer/opportunities/saved");
  const item = page.getByRole("listitem").filter({ hasText: `${word} help` });
  await expect(item).toContainText("Last alert");
  await item.getByLabel("Alert me").uncheck();
  await submit(page, item.getByRole("button", { name: "Save" }));
  await expect(page.getByText("Alert settings saved.")).toBeVisible();
});
