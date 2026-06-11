import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MealPlanWeek from "@/components/MealPlanWeek";
import { ToastProvider } from "@/contexts/ToastContext";
import { STORAGE_KEY, type ShoppingListItem } from "@/lib/shopping-list";
import type { MealPlanEntryWithRecipe, MealPlanRecipe } from "@/types/meal-plan";

const WEEK_START = "2026-06-08"; // a Monday

function makeRecipe(overrides: Partial<MealPlanRecipe> = {}): MealPlanRecipe {
  return {
    id: "recipe-1",
    title: "Tomatensoße",
    image_url: null,
    recipe_type: "kochen",
    servings: 4,
    tags: [],
    ingredients: [
      { amount: 100, unit: "g", name: "Tomaten" },
      { amount: 0.5, unit: "", name: "Zwiebel" },
    ],
    sections: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<MealPlanEntryWithRecipe> = {}): MealPlanEntryWithRecipe {
  return {
    id: "entry-1",
    created_at: "2026-06-08T10:00:00Z",
    user_id: "user-1",
    recipe_id: "recipe-1",
    date: "2026-06-09",
    meal_slot: "abend",
    servings: null,
    recipe: makeRecipe(),
    ...overrides,
  };
}

function renderWeek(props: Partial<React.ComponentProps<typeof MealPlanWeek>> = {}) {
  return render(
    <ToastProvider>
      <MealPlanWeek
        weekStart={WEEK_START}
        entries={props.entries ?? []}
        recipes={props.recipes ?? [makeRecipe()]}
      />
    </ToastProvider>
  );
}

beforeAll(() => {
  // jsdom may lack crypto.randomUUID (used by addRecipeItems)
  if (typeof globalThis.crypto.randomUUID !== "function") {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: () => `uuid-${Math.random().toString(36).slice(2)}`,
    });
  }
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MealPlanWeek", () => {
  it("renders 7 days with the three German meal slots each", () => {
    renderWeek();

    expect(screen.getAllByText("Frühstück")).toHaveLength(7);
    expect(screen.getAllByText("Mittag")).toHaveLength(7);
    expect(screen.getAllByText("Abend")).toHaveLength(7);
    // One add button per day × slot
    expect(screen.getAllByRole("button", { name: /Rezept hinzufügen/ })).toHaveLength(21);
    expect(screen.getByText("Für diese Woche ist noch nichts eingeplant.")).toBeInTheDocument();
  });

  it("renders an entry with recipe link and effective servings", () => {
    renderWeek({ entries: [makeEntry({ servings: 6 })] });

    const link = screen.getByRole("link", { name: "Tomatensoße" });
    expect(link).toHaveAttribute("href", "/recipe-1");
    expect(screen.getByText("6 Port.")).toBeInTheDocument();
  });

  it("falls back to the recipe's serving count when the entry has none", () => {
    renderWeek({ entries: [makeEntry({ servings: null })] });
    expect(screen.getByText("4 Port.")).toBeInTheDocument();
  });

  it("adds a recipe via the picker (POST with date, slot and recipe id)", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "new" }, error: null }),
    });
    renderWeek();

    // First add button = Monday, Frühstück
    await user.click(screen.getAllByRole("button", { name: /Rezept hinzufügen/ })[0]);
    expect(screen.getByText("Rezept auswählen")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Tomatensoße/ }));

    expect(global.fetch).toHaveBeenCalledWith("/api/meal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: WEEK_START,
        meal_slot: "fruehstueck",
        recipe_id: "recipe-1",
      }),
    });
  });

  it("shows the API error as a toast when adding fails (e.g. duplicate 409)", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ data: null, error: "Dieses Rezept ist für diese Mahlzeit bereits eingeplant." }),
    });
    renderWeek();

    await user.click(screen.getAllByRole("button", { name: /Rezept hinzufügen/ })[0]);
    await user.click(screen.getByRole("button", { name: /Tomatensoße/ }));

    expect(
      await screen.findByText("Dieses Rezept ist für diese Mahlzeit bereits eingeplant.")
    ).toBeInTheDocument();
  });

  it("filters the picker by title", async () => {
    const user = userEvent.setup();
    renderWeek({
      recipes: [makeRecipe(), makeRecipe({ id: "recipe-2", title: "Käsekuchen" })],
    });

    await user.click(screen.getAllByRole("button", { name: /Rezept hinzufügen/ })[0]);
    const dialogInput = screen.getByPlaceholderText("Rezept suchen…");
    await user.type(dialogInput, "käse");

    expect(screen.getByRole("button", { name: /Käsekuchen/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tomatensoße/ })).not.toBeInTheDocument();
  });

  it("adds the whole week to the shopping list with per-entry scaling", async () => {
    const user = userEvent.setup();
    renderWeek({
      entries: [
        makeEntry({ servings: 3 }), // 2 ingredients × 3 servings
        makeEntry({
          id: "entry-2",
          date: "2026-06-10",
          meal_slot: "mittag",
          servings: null, // → recipe default (4)
          recipe: makeRecipe({
            id: "recipe-2",
            title: "Käsekuchen",
            servings: 4,
            ingredients: [],
            sections: [
              {
                title: "Teig",
                ingredients: [{ amount: 50, unit: "g", name: "Mehl" }],
                steps: [],
              },
            ],
          }),
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /Woche zur Einkaufsliste/ }));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ShoppingListItem[];
    expect(stored).toHaveLength(3);

    const tomaten = stored.find((i) => i.ingredient_name === "Tomaten");
    expect(tomaten?.amount).toBe(300); // 100 g per portion × 3 servings

    const mehl = stored.find((i) => i.ingredient_name === "Mehl");
    expect(mehl?.amount).toBe(200); // 50 g per portion × recipe default 4
    expect(mehl?.recipe_title).toBe("Käsekuchen");

    // Toast with total item count
    expect(await screen.findByText("3 Zutaten zur Einkaufsliste hinzugefügt")).toBeInTheDocument();
  });

  it("removes an entry via DELETE", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    renderWeek({ entries: [makeEntry()] });

    await user.click(screen.getByRole("button", { name: "Eintrag entfernen" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/meal-plan/entry-1", { method: "DELETE" });
  });

  it("changes servings via PATCH", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    renderWeek({ entries: [makeEntry({ servings: 4 })] });

    await user.click(screen.getByRole("button", { name: "Mehr Portionen" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/meal-plan/entry-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ servings: 5 }),
    });
  });
});
