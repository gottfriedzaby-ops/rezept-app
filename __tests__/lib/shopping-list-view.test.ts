import {
  buildGroups,
  buildTypeGroups,
  buildRecipeGroups,
  mergeKey,
  formatRowAmount,
} from "@/lib/shopping-list-view";
import type { ShoppingListItem } from "@/lib/shopping-list";

let idCounter = 0;
function item(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: `id-${idCounter++}`,
    recipe_id: "r1",
    recipe_title: "Recipe A",
    ingredient_name: "Mehl",
    amount: 100,
    unit: "g",
    checked: false,
    added_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const NO_LEARNED = {} as Record<never, never>;

describe("formatRowAmount", () => {
  it("formats amount + unit + name", () => {
    expect(formatRowAmount(200, "g", "Tomaten")).toBe("200 g Tomaten");
  });
  it("omits a null amount", () => {
    expect(formatRowAmount(null, "", "Salz")).toBe("Salz");
  });
  it("keeps one decimal for non-integers", () => {
    expect(formatRowAmount(0.5, "", "Zitrone")).toBe("0.5 Zitrone");
  });
  it("renders integer floats without a trailing .0", () => {
    expect(formatRowAmount(3, "", "Eier")).toBe("3 Eier");
  });
});

describe("mergeKey", () => {
  it("is equal for same normalized name + unit", () => {
    expect(mergeKey(item({ ingredient_name: "Mehl", unit: "g" }))).toBe(
      mergeKey(item({ ingredient_name: "  mehl ", unit: "g" }))
    );
  });
  it("differs when the unit differs", () => {
    expect(mergeKey(item({ ingredient_name: "Tomaten", unit: "g" }))).not.toBe(
      mergeKey(item({ ingredient_name: "Tomaten", unit: "Dose" }))
    );
  });
});

describe("buildTypeGroups — merging", () => {
  it("merges same name+unit across recipes into one summed row", () => {
    const items = [
      item({ ingredient_name: "Tomaten", amount: 200, unit: "g", recipe_id: "r1" }),
      item({ ingredient_name: "Tomaten", amount: 100, unit: "g", recipe_id: "r2", recipe_title: "Recipe B" }),
    ];
    const groups = buildTypeGroups(items, NO_LEARNED);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("obst-gemuese");
    expect(groups[0].rows).toHaveLength(1);
    const row = groups[0].rows[0];
    expect(row.amount).toBe(300);
    expect(row.ids).toHaveLength(2);
    expect(row.sourceCount).toBe(2);
    expect(row.checked).toBe(false);
  });

  it("a merged row is checked only when ALL contributors are checked", () => {
    const partial = buildTypeGroups(
      [
        item({ ingredient_name: "Tomaten", amount: 200, unit: "g", checked: true }),
        item({ ingredient_name: "Tomaten", amount: 100, unit: "g", checked: false }),
      ],
      NO_LEARNED
    );
    expect(partial[0].rows[0].checked).toBe(false);

    const all = buildTypeGroups(
      [
        item({ ingredient_name: "Tomaten", amount: 200, unit: "g", checked: true }),
        item({ ingredient_name: "Tomaten", amount: 100, unit: "g", checked: true }),
      ],
      NO_LEARNED
    );
    expect(all[0].rows[0].checked).toBe(true);
  });

  it("all-null amounts yield a null row amount", () => {
    const groups = buildTypeGroups(
      [
        item({ ingredient_name: "Tomaten", amount: null, unit: "" }),
        item({ ingredient_name: "Tomaten", amount: null, unit: "" }),
      ],
      NO_LEARNED
    );
    expect(groups[0].rows[0].amount).toBeNull();
  });

  it("mixed null + numeric (same unit) sums the numeric parts", () => {
    const groups = buildTypeGroups(
      [
        item({ ingredient_name: "Tomaten", amount: 200, unit: "g" }),
        item({ ingredient_name: "Tomaten", amount: null, unit: "g" }),
      ],
      NO_LEARNED
    );
    expect(groups[0].rows[0].amount).toBe(200);
  });

  it("does NOT merge the same name across different units", () => {
    const groups = buildTypeGroups(
      [
        item({ ingredient_name: "Tomaten", amount: 1, unit: "Dose" }),
        item({ ingredient_name: "Tomaten", amount: 400, unit: "g" }),
      ],
      NO_LEARNED
    );
    expect(groups[0].id).toBe("obst-gemuese");
    expect(groups[0].rows).toHaveLength(2);
  });

  it("routes manual items to 'sonstiges' even when the name maps elsewhere", () => {
    const groups = buildTypeGroups(
      [item({ ingredient_name: "Tomaten", manual: true, recipe_id: "manual" })],
      NO_LEARNED
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("sonstiges");
  });

  it("orders groups by the fixed aisle order and omits empty categories", () => {
    const groups = buildTypeGroups(
      [
        item({ ingredient_name: "Salz", unit: "g" }), // gewuerze-saucen (order 6)
        item({ ingredient_name: "Tomaten", unit: "g" }), // obst-gemuese (order 0)
        item({ ingredient_name: "Mehl", unit: "g" }), // vorrat (order 5)
      ],
      NO_LEARNED
    );
    expect(groups.map((g) => g.id)).toEqual(["obst-gemuese", "vorrat", "gewuerze-saucen"]);
  });

  it("rounds float sums to one decimal (0.1 + 0.2 → 0.3)", () => {
    const groups = buildTypeGroups(
      [
        item({ ingredient_name: "Zucker", amount: 0.1, unit: "kg" }),
        item({ ingredient_name: "Zucker", amount: 0.2, unit: "kg" }),
      ],
      NO_LEARNED
    );
    expect(groups[0].rows[0].amount).toBe(0.3);
  });
});

describe("buildRecipeGroups", () => {
  it("does not merge — one row per item — and preserves first-seen recipe order", () => {
    const groups = buildRecipeGroups([
      item({ ingredient_name: "Tomaten", recipe_title: "Recipe B" }),
      item({ ingredient_name: "Tomaten", recipe_title: "Recipe A" }),
      item({ ingredient_name: "Mehl", recipe_title: "Recipe B" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["Recipe B", "Recipe A"]);
    expect(groups[0].rows).toHaveLength(2); // both Recipe B items, separate
    expect(groups[0].rows[0].ids).toHaveLength(1);
  });

  it("reports checkedCount per group", () => {
    const groups = buildRecipeGroups([
      item({ checked: true }),
      item({ checked: false }),
    ]);
    expect(groups[0].total).toBe(2);
    expect(groups[0].checkedCount).toBe(1);
  });
});

describe("buildGroups dispatch", () => {
  const items = [item({ ingredient_name: "Tomaten", unit: "g" })];
  it("delegates to recipe grouping", () => {
    expect(buildGroups(items, "recipe", NO_LEARNED)[0].kind).toBe("recipe");
  });
  it("delegates to type grouping", () => {
    expect(buildGroups(items, "type", NO_LEARNED)[0].kind).toBe("category");
  });
});
