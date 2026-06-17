import { normalizeTags } from "@/lib/tags";
import type { RecipeType } from "@/types/recipe";

/**
 * Smart-Collection-Vorschläge (Feature 20).
 *
 * Reine, deterministische Logik — kein I/O, kein Claude — damit sie sich wie
 * `lib/fasting.ts` / `lib/nutrition-goals.ts` erschöpfend testen lässt. Aus den
 * bereits kuratierten Rezeptdaten (recipe_type-Enum + normalisierte Tags +
 * Titel) leiten wir eine feste Menge kanonischer Kategorien ab. Jede Kategorie
 * hat einen stabilen `key` (englischer Bezeichner, nie sichtbar), der i18n-Namen
 * und gestaltete Icons zugeordnet wird.
 */

export type SmartCollectionKey =
  | "drinks"
  | "desserts"
  | "baking"
  | "soups"
  | "salads"
  | "grilling"
  | "breakfast"
  | "pasta"
  | "meat"
  | "fish"
  | "vegetarian"
  | "quick";

export type SuggestionLocale = "de" | "en" | "nl";

export const SUGGESTION_LOCALES: readonly SuggestionLocale[] = ["de", "en", "nl"];

/** Schwelle: ab so vielen passenden Rezepten wird eine Sammlung vorgeschlagen. */
export const SUGGESTION_MIN_MATCHES = 3;

/** Minimale Rezept-Projektion für den Matcher (Route/Seite selektiert nur diese Spalten). */
export interface SuggestionRecipeInput {
  id: string;
  title: string;
  recipe_type: RecipeType;
  tags: string[];
}

interface SmartCategoryDef {
  key: SmartCollectionKey;
  /** Trifft zu, wenn der recipe_type einer dieser Werte ist. */
  recipeTypes?: RecipeType[];
  /** Trifft zu, wenn die normalisierten Tags einen dieser Werte enthalten. */
  tags?: string[];
  /** Trifft zu, wenn der (klein geschriebene) Titel einen dieser Teilstrings enthält. */
  titleKeywords?: string[];
}

/**
 * Kanonische Kategorien in Anzeige-/Prioritätsreihenfolge. Reihenfolge =
 * Reihenfolge der Vorschläge bei Gleichstand.
 */
export const SMART_CATEGORIES: readonly SmartCategoryDef[] = [
  {
    key: "drinks",
    recipeTypes: ["cocktail"],
    tags: ["cocktail", "getränk", "drink", "smoothie", "limonade"],
    titleKeywords: ["cocktail", "drink", "smoothie", "limonade", "bowle", "punsch"],
  },
  {
    key: "desserts",
    tags: ["dessert", "nachtisch", "süßspeise"],
    // "eis" bewusst NICHT als Titel-Keyword: Teilstring-Treffer in „Reis"/„Fleisch".
    titleKeywords: ["dessert", "nachtisch", "pudding", "mousse", "tiramisu"],
  },
  {
    key: "baking",
    recipeTypes: ["backen"],
    tags: ["kuchen", "gebäck", "brot", "torte", "muffin"],
    // "torte" bewusst NICHT als Titel-Keyword: Teilstring-Treffer in „Tortellini".
    titleKeywords: ["kuchen", "brot", "muffin", "keks", "plätzchen", "gebäck"],
  },
  {
    key: "soups",
    tags: ["suppe", "eintopf"],
    titleKeywords: ["suppe", "eintopf", "soup", "stew", "brühe"],
  },
  {
    key: "salads",
    tags: ["salat"],
    titleKeywords: ["salat", "salad"],
  },
  {
    key: "grilling",
    recipeTypes: ["grillen"],
    tags: ["gegrillt", "bbq", "grill"],
    titleKeywords: ["grill", "bbq", "barbecue"],
  },
  {
    key: "breakfast",
    tags: ["frühstück"],
    titleKeywords: ["frühstück", "breakfast", "müsli", "porridge", "pancake", "ontbijt"],
  },
  {
    key: "pasta",
    tags: ["pasta"],
    titleKeywords: ["pasta", "nudel", "spaghetti", "lasagne", "penne", "risotto"],
  },
  {
    key: "meat",
    tags: ["fleisch", "geflügel"],
    titleKeywords: ["steak", "schnitzel", "gulasch", "hähnchen", "hackfleisch"],
  },
  {
    key: "fish",
    tags: ["fisch", "meeresfrüchte"],
    titleKeywords: ["fisch", "lachs", "garnelen", "thunfisch", "shrimp"],
  },
  {
    key: "vegetarian",
    tags: ["vegetarisch", "vegan"],
  },
  {
    key: "quick",
    tags: ["schnell", "einfach"],
  },
];

/** i18n-Namen je Kategorie in allen Locales. Muss `messages/*.json` (`CollectionSuggestions.categories.<key>.name`) spiegeln — per Test abgesichert. */
export const SMART_CATEGORY_NAMES: Record<
  SmartCollectionKey,
  Record<SuggestionLocale, string>
> = {
  drinks: { de: "Getränke & Cocktails", en: "Drinks & Cocktails", nl: "Dranken & Cocktails" },
  desserts: { de: "Desserts & Süßes", en: "Desserts & Sweets", nl: "Desserts & Zoet" },
  baking: { de: "Backen", en: "Baking", nl: "Bakken" },
  soups: { de: "Suppen & Eintöpfe", en: "Soups & Stews", nl: "Soepen & Stoofschotels" },
  salads: { de: "Salate", en: "Salads", nl: "Salades" },
  grilling: { de: "Grillen & BBQ", en: "Grilling & BBQ", nl: "Grillen & BBQ" },
  breakfast: { de: "Frühstück", en: "Breakfast", nl: "Ontbijt" },
  pasta: { de: "Pasta & Nudeln", en: "Pasta & Noodles", nl: "Pasta & Noedels" },
  meat: { de: "Fleischgerichte", en: "Meat Dishes", nl: "Vleesgerechten" },
  fish: { de: "Fisch & Meeresfrüchte", en: "Fish & Seafood", nl: "Vis & Zeevruchten" },
  vegetarian: { de: "Vegetarisch", en: "Vegetarian", nl: "Vegetarisch" },
  quick: { de: "Schnelle Küche", en: "Quick & Easy", nl: "Snel & Makkelijk" },
};

const ALL_KEYS = new Set<string>(SMART_CATEGORIES.map((c) => c.key));

/** Type-Guard: ist der String ein bekannter Kategorie-Key? */
export function isSmartCollectionKey(value: string): value is SmartCollectionKey {
  return ALL_KEYS.has(value);
}

/** Liefert den lokalisierten Namen einer Kategorie (Fallback: Deutsch). */
export function smartCategoryName(
  key: SmartCollectionKey,
  locale: SuggestionLocale = "de"
): string {
  return SMART_CATEGORY_NAMES[key][locale] ?? SMART_CATEGORY_NAMES[key].de;
}

function categoryMatches(
  def: SmartCategoryDef,
  recipeType: RecipeType,
  tagSet: Set<string>,
  lowerTitle: string
): boolean {
  if (def.recipeTypes?.includes(recipeType)) return true;
  if (def.tags?.some((tag) => tagSet.has(tag))) return true;
  if (def.titleKeywords?.some((kw) => lowerTitle.includes(kw))) return true;
  return false;
}

/**
 * Ordnet ein einzelnes Rezept allen passenden Kategorien zu (Prioritäts-
 * reihenfolge). Genutzt vom Post-Import-Vorschlag (erstes Element = beste
 * Kategorie).
 */
export function categorizeRecipe(recipe: SuggestionRecipeInput): SmartCollectionKey[] {
  const tagSet = new Set(normalizeTags(recipe.tags ?? []));
  const lowerTitle = (recipe.title ?? "").toLowerCase();
  const recipeType = recipe.recipe_type ?? "kochen";
  const keys: SmartCollectionKey[] = [];
  for (const def of SMART_CATEGORIES) {
    if (categoryMatches(def, recipeType, tagSet, lowerTitle)) keys.push(def.key);
  }
  return keys;
}

export interface CollectionSuggestion {
  key: SmartCollectionKey;
  matchCount: number;
  recipeIds: string[];
}

/**
 * Berechnet die Sammlungs-Vorschläge: gruppiert die Rezepte nach Kategorie,
 * filtert unter der Schwelle, bereits abgedeckte und verworfene Kategorien
 * heraus und sortiert nach kanonischer Priorität.
 */
export function computeCollectionSuggestions(args: {
  recipes: SuggestionRecipeInput[];
  coveredKeys: ReadonlySet<SmartCollectionKey>;
  dismissedKeys: ReadonlySet<SmartCollectionKey>;
  minMatches?: number;
}): CollectionSuggestion[] {
  const { recipes, coveredKeys, dismissedKeys, minMatches = SUGGESTION_MIN_MATCHES } = args;

  const idsByKey = new Map<SmartCollectionKey, string[]>();
  for (const recipe of recipes) {
    for (const key of categorizeRecipe(recipe)) {
      const list = idsByKey.get(key);
      if (list) list.push(recipe.id);
      else idsByKey.set(key, [recipe.id]);
    }
  }

  const suggestions: CollectionSuggestion[] = [];
  for (const def of SMART_CATEGORIES) {
    if (coveredKeys.has(def.key) || dismissedKeys.has(def.key)) continue;
    const ids = idsByKey.get(def.key) ?? [];
    if (ids.length < minMatches) continue;
    suggestions.push({ key: def.key, matchCount: ids.length, recipeIds: ids });
  }
  return suggestions;
}

/** Normalisiert einen Sammlungsnamen für Vergleiche (lowercase, Whitespace, Satzzeichen). */
export function normalizeCollectionName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/, "")
    .toLowerCase();
}

// Starke Schlüsselwörter → Kategorie, für benutzerdefinierte/umbenannte Sammlungen
// (z. B. „Meine Suppen", „Sommer-Cocktails 2026"). Reihenfolge = Priorität.
const NAME_KEYWORDS: ReadonlyArray<[string, SmartCollectionKey]> = [
  ["cocktail", "drinks"],
  ["getränk", "drinks"],
  ["drink", "drinks"],
  ["smoothie", "drinks"],
  ["dessert", "desserts"],
  ["nachtisch", "desserts"],
  ["süß", "desserts"],
  ["zoet", "desserts"],
  ["sweet", "desserts"],
  ["kuchen", "baking"],
  ["gebäck", "baking"],
  ["brot", "baking"],
  ["back", "baking"],
  ["bak", "baking"],
  ["suppe", "soups"],
  ["eintopf", "soups"],
  ["soup", "soups"],
  ["soep", "soups"],
  ["stew", "soups"],
  ["salat", "salads"],
  ["salad", "salads"],
  ["salade", "salads"],
  ["grill", "grilling"],
  ["bbq", "grilling"],
  ["barbecue", "grilling"],
  ["frühstück", "breakfast"],
  ["breakfast", "breakfast"],
  ["ontbijt", "breakfast"],
  ["pasta", "pasta"],
  ["nudel", "pasta"],
  ["noodle", "pasta"],
  ["noedel", "pasta"],
  ["spaghetti", "pasta"],
  ["fisch", "fish"],
  ["fish", "fish"],
  ["vis", "fish"],
  ["meeresfrüchte", "fish"],
  ["fleisch", "meat"],
  ["meat", "meat"],
  ["vlees", "meat"],
  ["vegan", "vegetarian"],
  ["vegetarisch", "vegetarian"],
  ["vegetarian", "vegetarian"],
  ["schnell", "quick"],
  ["quick", "quick"],
  ["snel", "quick"],
];

/**
 * Bildet einen (ggf. vom Nutzer umbenannten) Sammlungsnamen auf eine
 * Kategorie ab — exakter Treffer über alle Locale-Namen, sonst Schlüsselwort-
 * Fallback, sonst `null`. Einzige Quelle für Icon-Zuordnung *und* die
 * „bereits-abgedeckt"-Prüfung der Vorschläge.
 */
export function iconKeyForCollectionName(name: string): SmartCollectionKey | null {
  const norm = normalizeCollectionName(name);
  if (!norm) return null;

  for (const def of SMART_CATEGORIES) {
    for (const locale of SUGGESTION_LOCALES) {
      if (normalizeCollectionName(SMART_CATEGORY_NAMES[def.key][locale]) === norm) {
        return def.key;
      }
    }
  }

  for (const [keyword, key] of NAME_KEYWORDS) {
    if (norm.includes(keyword)) return key;
  }
  return null;
}
