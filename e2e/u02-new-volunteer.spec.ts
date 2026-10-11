import { expect, test } from "./support";
import { signUpAndOnboardVolunteer } from "./flows";

// U2 · New volunteer: sign up, verify email, onboard (skills, availability, radius, time zone),
// see Recommended with "why it matches".
test("U2 new volunteer onboards and sees why opportunities match", async ({ page }) => {
  await signUpAndOnboardVolunteer(page);
  await expect(page).toHaveURL(/\/volunteer\/dashboard/);
  await expect(page.getByRole("heading", { name: "Picked for you" })).toBeVisible();

  await page.goto("/volunteer/opportunities/recommended");
  const first = page.getByRole("region", { name: "Results" }).getByRole("listitem").first();
  await expect(first).toBeVisible();
  // Each card says why it matches: shared skills, distance or a schedule fit.
  await expect(first).toContainText(/skills|mi\b|fits your|matches/i);
});
