import {
  categorizeIngredientLocal,
  resolveCategory,
  normalizeIngredientName,
  CATEGORIES,
  CATEGORY_BY_ID,
  CATEGORY_IDS,
  isCategoryId,
} from "@/lib/ingredient-categories";

describe("normalizeIngredientName", () => {
  it("trims, collapses whitespace, strips trailing punctuation, lowercases", () => {
    expect(normalizeIngredientName("  Tomaten.  ")).toBe("tomaten");
    expect(normalizeIngredientName("Olivenöl,")).toBe("olivenöl");
    expect(normalizeIngredientName("Frische   Petersilie")).toBe("frische petersilie");
  });
});

describe("categorizeIngredientLocal — multilingual (de / en / nl)", () => {
  it("maps produce", () => {
    expect(categorizeIngredientLocal("Tomaten")).toBe("obst-gemuese");
    expect(categorizeIngredientLocal("tomato")).toBe("obst-gemuese");
    expect(categorizeIngredientLocal("tomaat")).toBe("obst-gemuese");
  });

  it("maps dairy", () => {
    expect(categorizeIngredientLocal("Butter")).toBe("molkerei-eier");
    expect(categorizeIngredientLocal("Cheddar cheese")).toBe("molkerei-eier");
  });

  it("maps meat & fish (prefix and standalone compounds)", () => {
    expect(categorizeIngredientLocal("Hähnchenbrust")).toBe("fleisch-fisch");
    expect(categorizeIngredientLocal("Thunfisch")).toBe("fleisch-fisch");
  });

  it("maps pantry staples in three languages", () => {
    expect(categorizeIngredientLocal("Mehl")).toBe("vorrat");
    expect(categorizeIngredientLocal("flour")).toBe("vorrat");
    expect(categorizeIngredientLocal("bloem")).toBe("vorrat");
  });

  it("maps spices/sauces, with specific compounds beating their stem", () => {
    expect(categorizeIngredientLocal("Salz")).toBe("gewuerze-saucen");
    // "Tomatenmark" must NOT be classified as produce via the "tomate" stem.
    expect(categorizeIngredientLocal("Tomatenmark")).toBe("gewuerze-saucen");
  });

  it("maps drinks, with 'Apfelsaft' beating the 'apfel' stem", () => {
    expect(categorizeIngredientLocal("Apfelsaft")).toBe("getraenke");
  });

  it("guards the egg/onion substring traps", () => {
    expect(categorizeIngredientLocal("Zwiebel")).toBe("obst-gemuese");
    expect(categorizeIngredientLocal("Eisbergsalat")).toBe("obst-gemuese");
    expect(categorizeIngredientLocal("Ei")).toBe("molkerei-eier");
    expect(categorizeIngredientLocal("Eier")).toBe("molkerei-eier");
    expect(categorizeIngredientLocal("ui")).toBe("obst-gemuese"); // Dutch onion
    expect(categorizeIngredientLocal("fruit")).toBeNull(); // 'ui' must not match inside "fruit"
  });

  it("returns null for unmapped names", () => {
    expect(categorizeIngredientLocal("völlig Unbekanntes XYZ")).toBeNull();
  });

  it("is case / whitespace / punctuation insensitive", () => {
    expect(categorizeIngredientLocal("  TOMATE  ")).toBe("obst-gemuese");
    expect(categorizeIngredientLocal("Tomate.")).toBe("obst-gemuese");
  });
});

describe("resolveCategory", () => {
  it("manual items are always 'sonstiges'", () => {
    expect(resolveCategory("Tomaten", {}, true)).toBe("sonstiges");
  });

  it("a learned-cache entry wins over a static-map miss", () => {
    expect(resolveCategory("Quinoa", { quinoa: "vorrat" })).toBe("vorrat");
  });

  it("falls back to the static map", () => {
    expect(resolveCategory("Tomaten", {})).toBe("obst-gemuese");
  });

  it("falls back to 'sonstiges' when entirely unknown", () => {
    expect(resolveCategory("Wunderpulver 3000", {})).toBe("sonstiges");
  });
});

describe("category metadata integrity", () => {
  it("has 10 unique categories with 'sonstiges' ordered last", () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(10);
    const maxOrder = Math.max(...CATEGORIES.map((c) => c.order));
    expect(CATEGORY_BY_ID["sonstiges"].order).toBe(maxOrder);
  });

  it("CATEGORY_BY_ID maps each id to its own meta", () => {
    for (const id of CATEGORY_IDS) expect(CATEGORY_BY_ID[id].id).toBe(id);
  });

  it("isCategoryId validates values", () => {
    expect(isCategoryId("vorrat")).toBe(true);
    expect(isCategoryId("not-a-category")).toBe(false);
    expect(isCategoryId(42)).toBe(false);
  });
});
