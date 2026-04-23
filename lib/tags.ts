const SYNONYMS: Record<string, string> = {
  // Dietary
  vegan: "vegan",
  vegetarian: "vegetarisch",
  veggie: "vegetarisch",
  vegetarisch: "vegetarisch",
  "gluten-free": "glutenfrei",
  glutenfree: "glutenfrei",
  "gluten free": "glutenfrei",
  "glutenfrei möglich": "glutenfrei",
  laktosefrei: "laktosefrei",
  "lactose-free": "laktosefrei",
  laktosefree: "laktosefrei",

  // Cuisines
  italian: "italienisch",
  italiano: "italienisch",
  italienisch: "italienisch",
  french: "französisch",
  franzosisch: "französisch",
  französisch: "französisch",
  neapolitan: "neapolitanisch",
  neapolitanisch: "neapolitanisch",
  chinese: "chinesisch",
  chinesisch: "chinesisch",
  japanese: "japanisch",
  japanisch: "japanisch",
  mexican: "mexikanisch",
  mexikanisch: "mexikanisch",
  thai: "thailändisch",
  "thai küche": "thailändisch",
  "thai food": "thailändisch",
  thaиländisch: "thailändisch",
  thailändisch: "thailändisch",
  indian: "indisch",
  indisch: "indisch",
  greek: "griechisch",
  griechisch: "griechisch",
  spanish: "spanisch",
  spanisch: "spanisch",
  austrian: "österreichisch",
  österreichisch: "österreichisch",
  german: "deutsch",
  deutsch: "deutsch",
  turkish: "türkisch",
  türkisch: "türkisch",
  lebanese: "libanesisch",
  libanesisch: "libanesisch",
  korean: "koreanisch",
  koreanisch: "koreanisch",
  vietnamese: "vietnamesisch",
  vietnamesisch: "vietnamesisch",

  // Meal types
  breakfast: "frühstück",
  frühstück: "frühstück",
  frühstuck: "frühstück",
  lunch: "mittagessen",
  mittagessen: "mittagessen",
  dinner: "abendessen",
  supper: "abendessen",
  abendessen: "abendessen",
  dessert: "dessert",
  desserts: "dessert",
  nachtisch: "dessert",
  snack: "snack",
  snacks: "snack",
  "side dish": "beilage",
  "side": "beilage",
  beilage: "beilage",
  beilagen: "beilage",
  vorspeise: "vorspeise",
  starter: "vorspeise",
  appetizer: "vorspeise",
  hauptgericht: "hauptgericht",
  "main course": "hauptgericht",
  "main dish": "hauptgericht",

  // Difficulty
  easy: "einfach",
  einfach: "einfach",
  simple: "einfach",
  mittel: "mittel",
  medium: "mittel",
  hard: "aufwändig",
  difficult: "aufwändig",
  aufwändig: "aufwändig",
  aufwendig: "aufwändig",
  complex: "aufwändig",

  // Cooking methods
  gebacken: "gebacken",
  baked: "gebacken",
  gebraten: "gebraten",
  fried: "gebraten",
  gedünstet: "gedünstet",
  steamed: "gedünstet",
  gegrillt: "gegrillt",
  grilled: "gegrillt",
  gekocht: "gekocht",
  boiled: "gekocht",
  roh: "roh",
  raw: "roh",
};

export function normalizeTag(tag: string): string {
  const cleaned = tag
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/, "")
    .toLowerCase();
  return SYNONYMS[cleaned] ?? cleaned;
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const n = normalizeTag(tag);
    if (n && !seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  }
  return result;
}
