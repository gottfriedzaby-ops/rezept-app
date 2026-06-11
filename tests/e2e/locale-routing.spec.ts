import { test, expect } from "@playwright/test";

/**
 * Locale routing on public pages. The default project locale is de-DE
 * (pinned in playwright.config.ts) — these specs guard the next-intl
 * wiring: prefix routing, Accept-Language detection, and the <html lang>
 * attribute.
 */

test.describe("locale routing", () => {
  test("unprefixed /login serves German for a German browser", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Willkommen zurück" })
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("/en/login serves the English UI", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("/nl/login serves the Dutch UI", async ({ page }) => {
    await page.goto("/nl/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "nl");
  });

  test("an English browser is detected on the unprefixed route", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await context.close();
  });
});
