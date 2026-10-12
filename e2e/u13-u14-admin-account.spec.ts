import { api, createUser, db, expect, PASSWORD, PERSONAS, postRequest, signedIn, submit, test, uniq } from "./support";

// U13 · Platform admin: work the reports queue, issue a strike, suspend a user, take down a
// listing; the audit log records each action.
test("U13 admin works a report: strike, suspend, take down; all audited", async ({ browser }) => {
  const reporter = await createUser({ name: "Rita Reporter", roles: ["volunteer"] });
  const offender = await createUser({ name: "Otto Offender", roles: ["requester"] });
  const title = uniq("Send me gift cards for groceries");
  const listing = await postRequest(offender.email, { title, category: "errands" });
  await api(reporter.email, "POST", "/v1/settings/reports", {
    target_type: "user",
    target_user_id: offender.id,
    category: "scam",
    details: `Asked me to buy gift cards before meeting (${title}).`
  });

  const { page } = await signedIn(browser, PERSONAS.admin);
  await page.goto("/admin/reports");
  const reportId = (await db.query("SELECT id FROM user_reports WHERE target_user_id = $1 ORDER BY created_at DESC LIMIT 1", [offender.id])).rows[0].id as string;
  await page.locator(`a[href="/admin/reports/${reportId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/admin/reports/${reportId}`));
  await expect(page.locator("main")).toContainText("gift cards");

  const reportUrl = page.url();
  await submit(page, page.getByRole("button", { name: "Apply strike" }));
  await expect(page).toHaveURL(/ok=1/);
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.goto(reportUrl);
  await submit(page, page.getByRole("button", { name: "Ban user" }));
  await expect(page).toHaveURL(/ok=1/);
  await expect
    .poll(async () => new Date((await db.query("SELECT banned_until FROM users WHERE id = $1", [offender.id])).rows[0].banned_until ?? 0).getTime())
    .toBeGreaterThan(Date.now());

  // The suspended account can't use the API.
  const banned = await fetch(`${process.env.E2E_API_URL || "http://localhost:4000"}/v1/requests/mine`, { headers: { authorization: `Bearer ${(await db.query("WITH t AS (SELECT gen_random_uuid()::text AS raw) INSERT INTO sessions (user_id, session_token, expires_at) SELECT $1, session_key(t.raw), NOW() + INTERVAL '1 hour' FROM t RETURNING (SELECT raw FROM t) AS session_token", [offender.id])).rows[0].session_token}` } });
  expect(banned.status).toBe(403);

  // Take the listing down.
  await page.goto(`/admin/opportunities?q=${encodeURIComponent(title)}`);
  const row = page.getByRole("row").filter({ hasText: title }).or(page.locator("li, article").filter({ hasText: title })).first();
  await row.getByText("Take down…").click();
  await row.getByLabel(/Reason/).fill("Scam: asks volunteers to buy gift cards.");
  await submit(page, row.getByRole("button", { name: "Take down" }));
  await expect.poll(async () => (await db.query("SELECT removed_at FROM service_requests WHERE id = $1", [listing])).rows[0].removed_at).toBeTruthy();

  // Audit log: one row per action.
  const actions = async (target: string) => (await db.query("SELECT action FROM admin_audit_log WHERE target_id = $1", [target])).rows.map((r) => String(r.action));
  // Audit rows are written as each response finishes.
  await expect.poll(async () => (await actions(offender.id)).sort()).toEqual(["users.ban", "users.strike"]);
  await expect.poll(async () => await actions(listing)).toContain("request.take_down");
  const onUser = await actions(offender.id);
  await page.goto(`/admin/audit?target=${offender.id}`);
  for (const a of onUser) await expect(page.getByRole("cell", { name: a, exact: true }).first()).toBeVisible();
  await page.goto(`/admin/audit?target=${listing}`);
  await expect(page.getByRole("cell", { name: "request.take_down" })).toBeVisible();
});

// U14 · Any user: password reset; account data export; account deletion.
test("U14 password reset, data export and account deletion", async ({ page, browser }) => {
  const user = await createUser({ name: "Zoe Leaving", roles: ["volunteer"] });

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();
  expect(page.url()).not.toContain(encodeURIComponent(user.email)); // no personal data in URLs
  const link = page.locator('a[href*="reset-password?token="]').first();
  await expect(link).toBeVisible();
  await page.goto((await link.getAttribute("href"))!);
  const newPassword = "Brand-New-Password-2026!";
  await page.getByLabel(/New password/).fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?ok=reset/);

  // Old password no longer works; the new one does.
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // Download my data.
  await page.goto("/settings/account");
  const href = await page.getByRole("link", { name: /Download my data/ }).getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const data = await res.json();
  expect(JSON.stringify(data)).toContain(user.email);

  // Delete the account.
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).not.toHaveURL(/\/settings/);
  const row = await db.query("SELECT deleted_at, email FROM users WHERE id = $1", [user.id]);
  expect(row.rows[0].deleted_at).toBeTruthy();
  expect(row.rows[0].email).not.toBe(user.email);

  const fresh = await browser.newPage();
  await fresh.goto("/login");
  await fresh.getByLabel("Email").fill(user.email);
  await fresh.getByLabel("Password").fill(newPassword);
  await fresh.getByRole("button", { name: "Log in" }).click();
  await expect(fresh).toHaveURL(/\/login/);
});
