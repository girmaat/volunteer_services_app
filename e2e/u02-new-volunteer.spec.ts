import { expect, test } from "./support";
import { signUpAndOnboardVolunteer } from "./flows";

// U2 · New volunteer: sign up, verify email, onboard (skills, availability, radius, time zone),
// see Recommended with "why it matches".
test("U2 new volunteer onboards and sees why opportunities match", async ({ page }) => {
  await signUpAndOnboardVolunteer(page);
  // Onboarding ends on a results screen, not an empty dashboard.
  await expect(page.getByRole("heading", { name: /Here’s what we found for you/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to my home" })).toBeVisible();

  await page.goto("/volunteer/opportunities/recommended");
  const first = page.getByRole("region", { name: "Results" }).getByRole("listitem").first();
  await expect(first).toBeVisible();
  // Each card says why it matches: shared skills, distance or a schedule fit.
  await expect(first).toContainText(/skills|mi\b|fits your|matches/i);
});
