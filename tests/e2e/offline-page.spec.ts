import { test, expect } from "@playwright/test";

/**
 * /offline is the PWA fallback: public (excluded from the auth middleware)
 * and fully client-side (localStorage + IndexedDB), so it is testable
 * hermetically without any Supabase mocking.
 */

const STORAGE_KEY = "rezept-app:shopping-list";

function seedItems() {
  const now = "2026-06-11T10:00:00.000Z";
  return [
    {
      id: "11111111-2222-3333-4444-555555555551",
      recipe_id: "r1",
      recipe_title: "Tomatensoße",
      ingredient_name: "Tomaten",
      amount: 300,
      unit: "g",
      checked: false,
      added_at: now,
      updated_at: now,
    },
    {
      id: "11111111-2222-3333-4444-555555555552",
      recipe_id: "r1",
      recipe_title: "Tomatensoße",
      ingredient_name: "Zwiebel",
      amount: 1,
      unit: "",
      checked: true,
      added_at: now,
      updated_at: now,
    },
    {
      id: "11111111-2222-3333-4444-555555555553",
      recipe_id: "manual",
      recipe_title: "Manuell hinzugefügt",
      ingredient_name: "Klopapier",
      amount: null,
      unit: "",
      checked: false,
      added_at: now,
      updated_at: now,
      manual: true,
      // tombstoned — must never appear in the UI
      deleted_at: now,
    },
  ];
}

test.describe("/offline", () => {
  test("renders the cached shopping list grouped by recipe, hiding tombstones", async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, items]) => localStorage.setItem(key, items),
      [STORAGE_KEY, JSON.stringify(seedItems())] as const
    );

    await page.goto("/offline");

    await expect(page.getByRole("heading", { name: "Du bist offline" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tomatensoße" })).toBeVisible();
    await expect(page.getByText("300 g Tomaten")).toBeVisible();
    // checked item rendered with its checkbox ticked
    await expect(page.getByRole("checkbox", { name: "1 Zwiebel" })).toBeChecked();
    // deletion tombstone stays hidden
    await expect(page.getByText("Klopapier")).toHaveCount(0);
  });

  test("ticking an item offline persists to localStorage", async ({ page }) => {
    await page.addInitScript(
      ([key, items]) => localStorage.setItem(key, items),
      [STORAGE_KEY, JSON.stringify(seedItems())] as const
    );

    await page.goto("/offline");
    await page.getByRole("checkbox", { name: "300 g Tomaten" }).check();

    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
      STORAGE_KEY
    );
    const tomaten = stored.find(
      (i: { ingredient_name: string }) => i.ingredient_name === "Tomaten"
    );
    expect(tomaten.checked).toBe(true);
  });

  test("shows the empty state without seeded data", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByText("Deine Einkaufsliste ist leer.")).toBeVisible();
  });
});
