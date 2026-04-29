import type { RecipeType } from "@/types/recipe";

const COOK_TIME_LABELS: Record<RecipeType, string> = {
  kochen: "Kochzeit",
  backen: "Backzeit",
  grillen: "Grillzeit",
  zubereiten: "Zubereitungszeit",
};

const CTA_LABELS: Record<RecipeType, string> = {
  kochen: "Jetzt kochen",
  backen: "Jetzt backen",
  grillen: "Jetzt grillen",
  zubereiten: "Jetzt zubereiten",
};

const TYPE_BADGES: Record<RecipeType, { label: string; emoji: string }> = {
  kochen:     { label: "Kochen",     emoji: "🍳" },
  backen:     { label: "Backen",     emoji: "🍞" },
  grillen:    { label: "Grillen",    emoji: "🔥" },
  zubereiten: { label: "Zubereiten", emoji: "🥗" },
};

export const cookTimeLabelFor = (type: RecipeType): string => COOK_TIME_LABELS[type];
export const ctaLabelFor = (type: RecipeType): string => CTA_LABELS[type];
export const recipeTypeBadgeFor = (type: RecipeType): { label: string; emoji: string } => TYPE_BADGES[type];
