import { expect, uniqEmail, PASSWORD } from "./support";
import type { Page } from "@playwright/test";

/** Sign up, open the development verification link, and finish volunteer onboarding. */
export async function signUpAndOnboardVolunteer(page: Page, name = "Vera Newcomer") {
  const email = uniqEmail("newvol");
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Outside production the verification link is shown on the page instead of being emailed.
  const link = page.locator('a[href*="verify-email?token="]').first();
  await expect(link).toBeVisible();
  await page.goto((await link.getAttribute("href"))!);

  await expect(page).toHaveURL(/\/onboarding/);
  await page.locator('input[name="role"][value="volunteer"]').check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Full name").fill(name);
  await page.getByLabel(/Public location/).fill("Astoria, Queens, NY");
  await page.getByLabel(/Skills \/ help categories/).fill("lifting, errands, food");
  await page.getByLabel(/Service radius/).fill("15");
  await page.getByRole("button", { name: "Save profile" }).click();

  await page.getByLabel("Timezone").fill("America/New_York");
  for (const d of ["Sat", "Sun"]) await page.getByLabel(d, { exact: true }).check();
  await page.getByLabel("In-person OK").check();
  await page.getByRole("button", { name: "Save availability" }).click();
  return email;
}

