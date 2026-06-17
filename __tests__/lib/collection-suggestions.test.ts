import {
  categorizeRecipe,
  computeCollectionSuggestions,
  iconKeyForCollectionName,
  isSmartCollectionKey,
  smartCategoryName,
  normalizeCollectionName,
  SMART_CATEGORIES,
  SMART_CATEGORY_NAMES,
  SUGGESTION_MIN_MATCHES,
  SUGGESTION_LOCALES,
  type SmartCollectionKey,
  type SuggestionRecipeInput,
} from "@/lib/collection-suggestions";
import { SMART_ICON_BY_KEY } from "@/lib/collection-icons";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";
import nlMessages from "@/messages/nl.json";

function recipe(partial: Partial<SuggestionRecipeInput>): SuggestionRecipeInput {
  return {
    id: partial.id ?? "id",
    title: partial.title ?? "",
    recipe_type: partial.recipe_type ?? "kochen",
    tags: partial.tags ?? [],
  };
}

describe("categorizeRecipe", () => {
  it("matches drinks by recipe_type, tag and title keyword", () => {
    expect(categorizeRecipe(recipe({ recipe_type: "cocktail" }))).toContain("drinks");
    expect(categorizeRecipe(recipe({ tags: ["cocktail"] }))).toContain("drinks");
    expect(categorizeRecipe(recipe({ title: "Sommer-Smoothie" }))).toContain("drinks");
  });

  it("matches desserts (incl. 'Nachtisch' tag synonym → dessert)", () => {
    expect(categorizeRecipe(recipe({ tags: ["dessert"] }))).toContain("desserts");
    expect(categorizeRecipe(recipe({ tags: ["Nachtisch"] }))).toContain("desserts");
    expect(categorizeRecipe(recipe({ title: "Schokoladen-Mousse" }))).toContain("desserts");
  });

  it("matches baking by recipe_type and tag", () => {
    expect(categorizeRecipe(recipe({ recipe_type: "backen" }))).toContain("baking");
    expect(categorizeRecipe(recipe({ tags: ["brot"] }))).toContain("baking");
  });

  it("matches soups, salads, grilling, breakfast", () => {
    expect(categorizeRecipe(recipe({ tags: ["suppe"] }))).toContain("soups");
    expect(categorizeRecipe(recipe({ title: "Klare Gemüsesuppe" }))).toContain("soups");
    expect(categorizeRecipe(recipe({ tags: ["salat"] }))).toContain("salads");
    expect(categorizeRecipe(recipe({ recipe_type: "grillen" }))).toContain("grilling");
    expect(categorizeRecipe(recipe({ tags: ["frühstück"] }))).toContain("breakfast");
  });

  it("matches vegetarian for both 'vegetarisch' and 'vegan'", () => {
    expect(categorizeRecipe(recipe({ tags: ["vegan"] }))).toContain("vegetarian");
    expect(categorizeRecipe(recipe({ tags: ["vegetarisch"] }))).toContain("vegetarian");
  });

  it("assigns a recipe to multiple categories in priority order", () => {
    const keys = categorizeRecipe(recipe({ tags: ["vegan", "suppe"] }));
    expect(keys).toEqual(expect.arrayContaining(["soups", "vegetarian"]));
    expect(keys.indexOf("soups")).toBeLessThan(keys.indexOf("vegetarian"));
  });

  it("returns no categories for an unremarkable recipe", () => {
    expect(categorizeRecipe(recipe({ title: "Reispfanne", tags: [] }))).toEqual([]);
  });
});

describe("computeCollectionSuggestions", () => {
  const empty = new Set<SmartCollectionKey>();

  it("suggests a category once it reaches the threshold", () => {
    const recipes = Array.from({ length: SUGGESTION_MIN_MATCHES }, (_, i) =>
      recipe({ id: `d${i}`, tags: ["dessert"] })
    );
    const result = computeCollectionSuggestions({
      recipes,
      coveredKeys: empty,
      dismissedKeys: empty,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "desserts", matchCount: SUGGESTION_MIN_MATCHES });
    expect(result[0].recipeIds).toEqual(["d0", "d1", "d2"]);
  });

  it("excludes a category below the threshold", () => {
    const recipes = Array.from({ length: SUGGESTION_MIN_MATCHES - 1 }, (_, i) =>
      recipe({ id: `d${i}`, tags: ["dessert"] })
    );
    expect(
      computeCollectionSuggestions({ recipes, coveredKeys: empty, dismissedKeys: empty })
    ).toEqual([]);
  });

  it("excludes covered and dismissed categories", () => {
    const recipes = [
      ...Array.from({ length: 3 }, (_, i) => recipe({ id: `s${i}`, tags: ["suppe"] })),
      ...Array.from({ length: 3 }, (_, i) => recipe({ id: `d${i}`, tags: ["dessert"] })),
    ];
    const result = computeCollectionSuggestions({
      recipes,
      coveredKeys: new Set<SmartCollectionKey>(["soups"]),
      dismissedKeys: new Set<SmartCollectionKey>(["desserts"]),
    });
    expect(result).toEqual([]);
  });

  it("sorts suggestions by canonical priority order", () => {
    const recipes = [
      ...Array.from({ length: 3 }, (_, i) => recipe({ id: `de${i}`, tags: ["dessert"] })),
      ...Array.from({ length: 3 }, (_, i) => recipe({ id: `dr${i}`, recipe_type: "cocktail" })),
    ];
    const result = computeCollectionSuggestions({
      recipes,
      coveredKeys: empty,
      dismissedKeys: empty,
    });
    expect(result.map((s) => s.key)).toEqual(["drinks", "desserts"]);
  });

  it("returns [] for an empty library", () => {
    expect(
      computeCollectionSuggestions({ recipes: [], coveredKeys: empty, dismissedKeys: empty })
    ).toEqual([]);
  });
});

describe("iconKeyForCollectionName", () => {
  it("maps the canonical name in every locale to its key", () => {
    for (const def of SMART_CATEGORIES) {
      for (const locale of SUGGESTION_LOCALES) {
        expect(iconKeyForCollectionName(SMART_CATEGORY_NAMES[def.key][locale])).toBe(def.key);
      }
    }
  });

  it("maps user-renamed collections via keyword fallback", () => {
    expect(iconKeyForCollectionName("Meine Suppen")).toBe("soups");
    expect(iconKeyForCollectionName("Sommer-Cocktails 2026")).toBe("drinks");
    expect(iconKeyForCollectionName("Nachtisch")).toBe("desserts");
  });

  it("returns null for an unrelated name (folder fallback)", () => {
    expect(iconKeyForCollectionName("Reste-Verwertung")).toBeNull();
    expect(iconKeyForCollectionName("   ")).toBeNull();
  });

  it("is case- and whitespace-insensitive", () => {
    expect(iconKeyForCollectionName("  SALATE  ")).toBe("salads");
  });
});

describe("helpers", () => {
  it("isSmartCollectionKey guards known keys", () => {
    expect(isSmartCollectionKey("drinks")).toBe(true);
    expect(isSmartCollectionKey("nope")).toBe(false);
  });

  it("smartCategoryName falls back to German", () => {
    expect(smartCategoryName("soups", "en")).toBe("Soups & Stews");
    expect(smartCategoryName("soups")).toBe("Suppen & Eintöpfe");
  });

  it("normalizeCollectionName strips trailing punctuation and lowercases", () => {
    expect(normalizeCollectionName("  Salate!  ")).toBe("salate");
  });
});

describe("drift guard: keys, icons and i18n stay in sync", () => {
  const messagesByLocale: Record<string, typeof deMessages> = {
    de: deMessages,
    en: enMessages as typeof deMessages,
    nl: nlMessages as typeof deMessages,
  };

  it("every category has a def, an icon and a name in all locales", () => {
    for (const def of SMART_CATEGORIES) {
      expect(SMART_ICON_BY_KEY[def.key]).toBeDefined();
      for (const locale of SUGGESTION_LOCALES) {
        const fromMessages = (messagesByLocale[locale].CollectionSuggestions.categories as
          Record<string, { name: string }>)[def.key]?.name;
        expect(fromMessages).toBe(SMART_CATEGORY_NAMES[def.key][locale]);
      }
    }
  });
});
