import { createUser, expect, postRequest, test, uniq, uniqEmail, PASSWORD } from "./support";

// U1 · Visitor: browse opportunities and organizations logged out; no exact address or contact
// details are visible; sign up.
test("U1 visitor browses without seeing private details, then signs up", async ({ page }) => {
  const owner = await createUser({ name: "Uma Owner", roles: ["requester"] });
  const title = uniq("Carry boxes to the basement");
  const id = await postRequest(owner.email, {
    title,
    description: "Two boxes to the basement. Call me at 718-555-0199 or email uma.owner@example.org when you arrive.",
    publicArea: "Astoria, Queens, NY",
    exactAddress: "31-10 Ditmars Blvd, Apt 2"
  });

  await page.goto("/opportunities");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/opportunit/i);
  await page.getByLabel("Search").fill(title);
  await page.getByRole("button", { name: "Show results" }).click();
  const card = page.getByRole("link", { name: title });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page).toHaveURL(new RegExp(`/opportunities/${id}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText("Astoria, Queens, NY").first()).toBeVisible();
  const body = await page.locator("main").innerText();
  expect(body).not.toContain("31-10 Ditmars");
  expect(body).not.toContain("718-555-0199");
  expect(body).not.toContain("uma.owner@example.org");
  expect(body).not.toContain(owner.email);

  await page.goto("/organizations");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Harbor Food Bank", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Harbor Food Bank");
  expect(await page.locator("main").innerText()).not.toMatch(/@thankyou\.test/);

  // Sign up.
  await page.goto("/signup");
  await page.getByLabel("Email").fill(uniqEmail("visitor"));
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/check your email|verification/i).first()).toBeVisible();
});
