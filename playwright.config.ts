import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end UAT scripts (U1–U15) plus the accessibility sweep.
 *
 *   pnpm e2e                 # against a running local stack (web :3202, API :4202, seeded DB)
 *   E2E_WEBKIT=1 pnpm e2e    # also in iPhone Safari (WebKit), where WebKit is installed
 *   E2E_BASE_URL=https://staging.example.org E2E_API_URL=... E2E_DATABASE_URL=... pnpm e2e
 *
 * Specs create their own users and requests with unique names, so they can run repeatedly
 * against the same database. They share it, so they run one at a time.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "e2e-results/junit.xml" }]] : [["list"], ["html", { open: "never" }]],
  outputDir: "e2e-results/artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3202",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    timezoneId: "America/New_York",
    locale: "en-US"
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    // U15 and the 375 px checks.
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } }, testMatch: /mobile\.spec\.ts/ },
    // iPhone Safari: E2E_WEBKIT=1 runs every script in WebKit at iPhone size (needs `npx playwright install webkit`).
    ...(process.env.E2E_WEBKIT === "1"
      ? [{ name: "iphone-safari", use: { ...devices["iPhone 13"] } }]
      : [])
  ]
});
