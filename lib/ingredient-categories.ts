// Ingredient → supermarket-aisle categorization for the shopping list "by type" view.
//
// Mirrors the lib/tags.ts (normalize + lookup) and lib/tag-colors.ts (ordered
// keyword list, first match wins) patterns. Matching is two-tier:
//   1. EXACT_WORDS — whole-word equality, for short/ambiguous staples where a
//      naive substring match would misfire (e.g. "ei"/"egg" must not match
//      "Eisbergsalat" or "eggplant"; "ui" must not match "fruit").
//   2. KEYWORD_MAP — substring match on the normalized name. This deliberately
//      catches German compounds in BOTH directions (prefix "Hähnchenbrust" and
//      suffix "Eisbergsalat"), so order entries most-specific-first.
//
// The map is representative, not exhaustive: unmapped ingredients return null
// and are filled in (and cached) by the hybrid Claude fallback — see
// lib/useAutoCategorize.ts and app/api/shopping/categorize/route.ts.

export type CategoryId =
  | "obst-gemuese"
  | "molkerei-eier"
  | "fleisch-fisch"
  | "brot-backwaren"
  | "tiefkuehl"
  | "vorrat"
  | "gewuerze-saucen"
  | "getraenke"
  | "suesses-snacks"
  | "sonstiges";

export interface CategoryMeta {
  id: CategoryId;
  /** i18n key under the "ShoppingCategories" namespace. */
  labelKey: string;
  emoji: string;
  /** Stable display order — roughly a typical store walk; "sonstiges" last. */
  order: number;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: "obst-gemuese", labelKey: "obstGemuese", emoji: "🥬", order: 0 },
  { id: "molkerei-eier", labelKey: "molkereiEier", emoji: "🧀", order: 1 },
  { id: "fleisch-fisch", labelKey: "fleischFisch", emoji: "🥩", order: 2 },
  { id: "brot-backwaren", labelKey: "brotBackwaren", emoji: "🥖", order: 3 },
  { id: "tiefkuehl", labelKey: "tiefkuehl", emoji: "🧊", order: 4 },
  { id: "vorrat", labelKey: "vorrat", emoji: "🥫", order: 5 },
  { id: "gewuerze-saucen", labelKey: "gewuerzeSaucen", emoji: "🧂", order: 6 },
  { id: "getraenke", labelKey: "getraenke", emoji: "🧃", order: 7 },
  { id: "suesses-snacks", labelKey: "suessesSnacks", emoji: "🍫", order: 8 },
  { id: "sonstiges", labelKey: "sonstiges", emoji: "🛒", order: 9 },
];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export const CATEGORY_BY_ID: Record<CategoryId, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, CategoryMeta>;

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

// Whole-word staples (de / en / nl). Checked before the substring map.
const EXACT_WORDS: Array<[string, CategoryId]> = [
  ["ei", "molkerei-eier"],
  ["eier", "molkerei-eier"],
  ["egg", "molkerei-eier"],
  ["eggs", "molkerei-eier"],
  ["ui", "obst-gemuese"],
  ["uien", "obst-gemuese"],
  ["cola", "getraenke"], // whole-word so it never matches inside "Schokolade"
];

// Substring keywords, most-specific-first (first match wins). Multilingual.
const KEYWORD_MAP: Array<[string, CategoryId]> = [
  // --- Specific compounds that must beat their generic stem (placed first) ---
  ["tomatenmark", "gewuerze-saucen"],
  ["tomatensauce", "gewuerze-saucen"],
  ["tomatensoße", "gewuerze-saucen"],
  ["passierte tomate", "vorrat"],
  ["gehackte tomate", "vorrat"],
  ["kokosmilch", "vorrat"],
  ["coconut milk", "vorrat"],
  ["sojasauce", "gewuerze-saucen"],
  ["sojasoße", "gewuerze-saucen"],
  ["soy sauce", "gewuerze-saucen"],
  ["sojasaus", "gewuerze-saucen"],
  ["fischsauce", "gewuerze-saucen"],
  ["fish sauce", "gewuerze-saucen"],
  ["frischkäse", "molkerei-eier"],
  ["rührei", "molkerei-eier"],
  ["eigelb", "molkerei-eier"],
  ["eiweiß", "molkerei-eier"],
  ["eiweiss", "molkerei-eier"],
  ["apfelsaft", "getraenke"],
  ["apfelessig", "vorrat"],

  // --- Obst & Gemüse ---
  ["tomate", "obst-gemuese"],
  ["tomato", "obst-gemuese"],
  ["tomaat", "obst-gemuese"],
  ["zwiebel", "obst-gemuese"],
  ["onion", "obst-gemuese"],
  ["knoblauch", "obst-gemuese"],
  ["garlic", "obst-gemuese"],
  ["knoflook", "obst-gemuese"],
  ["kartoffel", "obst-gemuese"],
  ["potato", "obst-gemuese"],
  ["aardappel", "obst-gemuese"],
  ["karotte", "obst-gemuese"],
  ["möhre", "obst-gemuese"],
  ["carrot", "obst-gemuese"],
  ["wortel", "obst-gemuese"],
  ["paprika", "obst-gemuese"],
  ["pepper", "obst-gemuese"],
  ["salat", "obst-gemuese"],
  ["lettuce", "obst-gemuese"],
  ["spinat", "obst-gemuese"],
  ["spinach", "obst-gemuese"],
  ["gurke", "obst-gemuese"],
  ["cucumber", "obst-gemuese"],
  ["komkommer", "obst-gemuese"],
  ["zucchini", "obst-gemuese"],
  ["aubergine", "obst-gemuese"],
  ["eggplant", "obst-gemuese"],
  ["champignon", "obst-gemuese"],
  ["pilz", "obst-gemuese"],
  ["mushroom", "obst-gemuese"],
  ["brokkoli", "obst-gemuese"],
  ["broccoli", "obst-gemuese"],
  ["apfel", "obst-gemuese"],
  ["apple", "obst-gemuese"],
  ["appel", "obst-gemuese"],
  ["banane", "obst-gemuese"],
  ["banana", "obst-gemuese"],
  ["zitrone", "obst-gemuese"],
  ["lemon", "obst-gemuese"],
  ["citroen", "obst-gemuese"],
  ["limette", "obst-gemuese"],
  ["lime", "obst-gemuese"],
  ["beere", "obst-gemuese"],
  ["berry", "obst-gemuese"],
  ["ingwer", "obst-gemuese"],
  ["ginger", "obst-gemuese"],
  ["petersilie", "obst-gemuese"],
  ["parsley", "obst-gemuese"],
  ["basilikum", "obst-gemuese"],
  ["basil", "obst-gemuese"],
  ["kräuter", "obst-gemuese"],
  ["avocado", "obst-gemuese"],

  // --- Molkerei & Eier ---
  ["milch", "molkerei-eier"],
  ["milk", "molkerei-eier"],
  ["melk", "molkerei-eier"],
  ["butter", "molkerei-eier"],
  ["boter", "molkerei-eier"],
  ["käse", "molkerei-eier"],
  ["cheese", "molkerei-eier"],
  ["kaas", "molkerei-eier"],
  ["parmesan", "molkerei-eier"],
  ["mozzarella", "molkerei-eier"],
  ["feta", "molkerei-eier"],
  ["sahne", "molkerei-eier"],
  ["cream", "molkerei-eier"],
  ["room", "molkerei-eier"],
  ["joghurt", "molkerei-eier"],
  ["yoghurt", "molkerei-eier"],
  ["yogurt", "molkerei-eier"],
  ["quark", "molkerei-eier"],
  ["schmand", "molkerei-eier"],
  ["mascarpone", "molkerei-eier"],
  ["crème fraîche", "molkerei-eier"],

  // --- Fleisch & Fisch ---
  ["hähnchen", "fleisch-fisch"],
  ["hühner", "fleisch-fisch"],
  ["chicken", "fleisch-fisch"],
  ["kip", "fleisch-fisch"],
  ["hackfleisch", "fleisch-fisch"],
  ["mince", "fleisch-fisch"],
  ["gehakt", "fleisch-fisch"],
  ["rind", "fleisch-fisch"],
  ["beef", "fleisch-fisch"],
  ["schwein", "fleisch-fisch"],
  ["pork", "fleisch-fisch"],
  ["speck", "fleisch-fisch"],
  ["bacon", "fleisch-fisch"],
  ["pancetta", "fleisch-fisch"],
  ["schinken", "fleisch-fisch"],
  ["ham", "fleisch-fisch"],
  ["wurst", "fleisch-fisch"],
  ["sausage", "fleisch-fisch"],
  ["lachs", "fleisch-fisch"],
  ["salmon", "fleisch-fisch"],
  ["zalm", "fleisch-fisch"],
  ["thunfisch", "fleisch-fisch"],
  ["tuna", "fleisch-fisch"],
  ["garnele", "fleisch-fisch"],
  ["shrimp", "fleisch-fisch"],
  ["fisch", "fleisch-fisch"],
  ["fish", "fleisch-fisch"],
  ["vis", "fleisch-fisch"],
  ["filet", "fleisch-fisch"],
  ["tofu", "fleisch-fisch"],

  // --- Brot & Backwaren ---
  ["brötchen", "brot-backwaren"],
  ["baguette", "brot-backwaren"],
  ["toast", "brot-backwaren"],
  ["brot", "brot-backwaren"],
  ["bread", "brot-backwaren"],
  ["brood", "brot-backwaren"],
  ["tortilla", "brot-backwaren"],
  ["wrap", "brot-backwaren"],

  // --- Tiefkühl ---
  ["tiefkühl", "tiefkuehl"],
  ["tiefgekühlt", "tiefkuehl"],
  ["gefroren", "tiefkuehl"],
  ["frozen", "tiefkuehl"],
  ["diepvries", "tiefkuehl"],

  // --- Vorrat / Trockenwaren ---
  ["mehl", "vorrat"],
  ["flour", "vorrat"],
  ["bloem", "vorrat"],
  ["zucker", "vorrat"],
  ["sugar", "vorrat"],
  ["suiker", "vorrat"],
  ["reis", "vorrat"],
  ["rice", "vorrat"],
  ["rijst", "vorrat"],
  ["nudel", "vorrat"],
  ["pasta", "vorrat"],
  ["spaghetti", "vorrat"],
  ["noodle", "vorrat"],
  ["linse", "vorrat"],
  ["lentil", "vorrat"],
  ["kichererbse", "vorrat"],
  ["chickpea", "vorrat"],
  ["bohne", "vorrat"],
  ["bean", "vorrat"],
  ["mais", "vorrat"],
  ["haferflocke", "vorrat"],
  ["oats", "vorrat"],
  ["olivenöl", "vorrat"],
  ["olive oil", "vorrat"],
  ["oil", "vorrat"],
  ["olie", "vorrat"],
  ["essig", "vorrat"],
  ["vinegar", "vorrat"],
  ["azijn", "vorrat"],
  ["honig", "vorrat"],
  ["honey", "vorrat"],
  ["nuss", "vorrat"],
  ["mandel", "vorrat"],
  ["almond", "vorrat"],
  ["hefe", "vorrat"],
  ["yeast", "vorrat"],
  ["backpulver", "vorrat"],

  // --- Gewürze & Saucen ---
  ["salz", "gewuerze-saucen"],
  ["salt", "gewuerze-saucen"],
  ["zout", "gewuerze-saucen"],
  ["pfeffer", "gewuerze-saucen"],
  ["peper", "gewuerze-saucen"],
  ["paprikapulver", "gewuerze-saucen"],
  ["curry", "gewuerze-saucen"],
  ["kreuzkümmel", "gewuerze-saucen"],
  ["cumin", "gewuerze-saucen"],
  ["zimt", "gewuerze-saucen"],
  ["cinnamon", "gewuerze-saucen"],
  ["oregano", "gewuerze-saucen"],
  ["chili", "gewuerze-saucen"],
  ["ketchup", "gewuerze-saucen"],
  ["senf", "gewuerze-saucen"],
  ["mustard", "gewuerze-saucen"],
  ["brühe", "gewuerze-saucen"],
  ["stock", "gewuerze-saucen"],
  ["bouillon", "gewuerze-saucen"],
  ["gewürz", "gewuerze-saucen"],
  ["spice", "gewuerze-saucen"],

  // --- Getränke ---
  ["wasser", "getraenke"],
  ["water", "getraenke"],
  ["saft", "getraenke"],
  ["juice", "getraenke"],
  ["wein", "getraenke"],
  ["wine", "getraenke"],
  ["wijn", "getraenke"],
  ["bier", "getraenke"],
  ["beer", "getraenke"],
  ["limonade", "getraenke"],

  // --- Süßes & Snacks ---
  ["schokolade", "suesses-snacks"],
  ["schoko", "suesses-snacks"],
  ["chocolate", "suesses-snacks"],
  ["chocola", "suesses-snacks"],
  ["keks", "suesses-snacks"],
  ["cookie", "suesses-snacks"],
  ["koek", "suesses-snacks"],
  ["chips", "suesses-snacks"],
  ["riegel", "suesses-snacks"],
  ["bonbon", "suesses-snacks"],
];

/** Trim, collapse whitespace, strip trailing punctuation, lowercase. */
export function normalizeIngredientName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/, "")
    .toLowerCase();
}

/**
 * Categorize by the static rules only. Returns null when the name is unmapped,
 * so callers can decide whether to ask the Claude fallback.
 */
export function categorizeIngredientLocal(name: string): CategoryId | null {
  const n = normalizeIngredientName(name);
  if (!n) return null;

  // Tier 1: whole-word match for short/ambiguous staples.
  const words = n.split(/[^a-zà-ÿß]+/).filter(Boolean);
  for (const [word, id] of EXACT_WORDS) {
    if (words.includes(word)) return id;
  }

  // Tier 2: substring match (handles prefix- and suffix-compounds).
  for (const [kw, id] of KEYWORD_MAP) {
    if (n.includes(kw)) return id;
  }

  // Oils: any word ending in "öl" (Olivenöl, Rapsöl, Sonnenblumenöl, plain Öl).
  // Checked late so a specific food keyword still wins, and as a suffix test so
  // it never misfires on unrelated words like "völlig".
  if (words.some((w) => w.endsWith("öl"))) return "vorrat";

  return null;
}

/**
 * Final category for an ingredient: learned-cache → static map → "sonstiges".
 * Manual items are always "sonstiges" for predictability. The learned map is
 * passed in (the component reads it from localStorage) so this stays pure.
 */
export function resolveCategory(
  name: string,
  learned: Record<string, CategoryId>,
  manual?: boolean
): CategoryId {
  if (manual) return "sonstiges";
  const learnedHit = learned[normalizeIngredientName(name)];
  if (isCategoryId(learnedHit)) return learnedHit;
  return categorizeIngredientLocal(name) ?? "sonstiges";
}

// --- Learned-overrides cache (per-user, localStorage) ---------------------
// Claude's answers for previously-unmapped names are stored here so the API is
// only ever called once per genuinely new ingredient.

export const LEARNED_KEY = "rezept-app:shopping-list:learned-categories";

export function getLearnedCategories(): Record<string, CategoryId> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LEARNED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, CategoryId> = {};
    for (const [name, id] of Object.entries(parsed as Record<string, unknown>)) {
      if (isCategoryId(id)) out[name] = id;
    }
    return out;
  } catch {
    return {};
  }
}

/** Read-merge-save. Returns the merged map so callers can update state in one go. */
export function mergeLearnedCategories(
  updates: Record<string, CategoryId>
): Record<string, CategoryId> {
  const merged = { ...getLearnedCategories(), ...updates };
  if (typeof window === "undefined") return merged;
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(merged));
  } catch {
    // localStorage might be unavailable (private browsing / quota)
  }
  return merged;
}
