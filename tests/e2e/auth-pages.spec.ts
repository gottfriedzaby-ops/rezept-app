import { test, expect } from "@playwright/test";

/**
 * E2E smoke tests for the public auth pages.
 *
 * These run against `npm run dev` (started by playwright.config.ts) and
 * intercept all Supabase auth API calls via `page.route()`. No real network,
 * no real credentials.
 *
 * The three pages covered here are public per middleware.ts (i.e. they
 * don't redirect unauthenticated users). Authenticated flows that require
 * a valid Supabase session would need either a test Supabase project or
 * deeper cookie mocking — see docs/test-concept.md §14.
 */

/**
 * Mock the Supabase auth REST API at the URL configured for the dev server
 * (placeholder.supabase.co). The Supabase JS client calls /auth/v1/token,
 * /auth/v1/signup, /auth/v1/recover, etc. — we route them all through here.
 */
function mockSupabaseAuth(
  page: import("@playwright/test").Page,
  handlers: {
    onToken?: (route: import("@playwright/test").Route) => Promise<void> | void;
    onSignUp?: (route: import("@playwright/test").Route) => Promise<void> | void;
    onRecover?: (route: import("@playwright/test").Route) => Promise<void> | void;
  } = {}
) {
  return page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/token") && handlers.onToken) {
      return handlers.onToken(route);
    }
    if (url.includes("/auth/v1/signup") && handlers.onSignUp) {
      return handlers.onSignUp(route);
    }
    if (url.includes("/auth/v1/recover") && handlers.onRecover) {
      return handlers.onRecover(route);
    }
    // Default: empty 200 — harmless for any other auth call the SDK makes
    await route.fulfill({ status: 200, body: "{}" });
  });
}

test.describe("/login", () => {
  test("renders the login form with all expected fields", async ({ page }) => {
    await mockSupabaseAuth(page);
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Willkommen zurück" })
    ).toBeVisible();
    await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
    await expect(page.getByLabel("Passwort")).toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("button", { name: /Mit Google anmelden/ })
    ).toBeVisible();
  });

  test("shows the wrong-credentials error when the API rejects", async ({
    page,
  }) => {
    await mockSupabaseAuth(page, {
      onToken: async (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            msg: "Invalid login credentials",
          }),
        }),
    });

    await page.goto("/login");
    await page.getByLabel("E-Mail-Adresse").fill("user@example.com");
    await page.getByLabel("Passwort").fill("wrong-password");
    await page.getByRole("button", { name: "Anmelden", exact: true }).click();

    await expect(page.locator('p[role="alert"]')).toContainText(
      "E-Mail-Adresse oder Passwort ist falsch."
    );
  });
});

test.describe("/register", () => {
  test("renders the registration form", async ({ page }) => {
    await mockSupabaseAuth(page);
    await page.goto("/register");

    await expect(
      page.getByRole("heading", { name: "Konto erstellen" })
    ).toBeVisible();
    await expect(page.getByLabel("E-Mail-Adresse")).toBeVisible();
    await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Passwort bestätigen")).toBeVisible();
  });

  test("blocks submission with a password-mismatch error (client-side, no API call)", async ({
    page,
  }) => {
    let signupCalled = false;
    await mockSupabaseAuth(page, {
      onSignUp: async (route) => {
        signupCalled = true;
        await route.fulfill({ status: 200, body: "{}" });
      },
    });

    await page.goto("/register");
    await page.getByLabel("E-Mail-Adresse").fill("newuser@example.com");
    await page.getByLabel("Passwort", { exact: true }).fill("password1");
    await page.getByLabel("Passwort bestätigen").fill("password2");
    await page.getByRole("button", { name: "Registrieren" }).click();

    await expect(page.locator('p[role="alert"]')).toContainText(
      "Die Passwörter stimmen nicht überein."
    );
    expect(signupCalled).toBe(false);
  });
});

test.describe("/login/forgot-password", () => {
  test("shows the success state after a successful request", async ({ page }) => {
    await mockSupabaseAuth(page, {
      onRecover: async (route) =>
        route.fulfill({ status: 200, body: "{}" }),
    });

    await page.goto("/login/forgot-password");
    await page.getByLabel("E-Mail-Adresse").fill("alice@example.com");
    await page.getByRole("button", { name: "Link anfordern" }).click();

    await expect(page.getByText("E-Mail verschickt")).toBeVisible();
  });
});
