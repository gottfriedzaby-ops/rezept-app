import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration for Rezept-App.
 *
 * Approach: tests run against `npm run dev` and intercept every external
 * dependency via `page.route()`. No real Supabase / Claude / network calls
 * are made. This keeps the suite hermetic and runnable in CI without any
 * external credentials.
 *
 * For deployment-time smoke tests against a real Supabase test project, see
 * docs/test-concept.md §14 (flagged for later).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Placeholder values so the middleware's createServerClient doesn't crash
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
    },
  },
});
