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
  // Clicks a chip the way a person does: on its label (the checkbox itself is visually hidden).
  const chip = (name: string, value: string) => page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();

  // 1 · How you'll use it.
  await page.locator('label:has(input[name="role"][value="volunteer"])').click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 2 · About you.
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await page.locator("#ob-name").fill(name);
  await page.locator("#ob-area").fill("Astoria, Queens, NY");
  await page.getByRole("button", { name: "Continue" }).click();

  // 3 · Interests: chips, a radius.
  for (const c of ["errands", "food"]) await chip("categories", c);
  await chip("skills", "lifting");
  await chip("causes", "seniors");
  await page.locator("#ob-radius").selectOption("15");
  await page.getByRole("button", { name: "Continue" }).click();

  // 4 · Schedule: Sat/Sun are preselected and the time zone comes from the browser.
  await expect(page.locator('input[name="days"][value="sat"]')).toBeChecked();
  await expect(page.locator("#ob-tz")).not.toHaveValue("");
  await page.getByRole("button", { name: "Show me opportunities" }).click();
  await expect(page).toHaveURL(/\/onboarding\/welcome/);
  return email;
}

