import {
  cookTimeLabelFor,
  ctaLabelFor,
  recipeTypeBadgeFor,
} from "@/lib/recipeTypeLabels";
import type { RecipeType } from "@/types/recipe";

const ALL_TYPES: RecipeType[] = [
  "kochen",
  "backen",
  "grillen",
  "zubereiten",
  "cocktail",
];

describe("recipeTypeLabels", () => {
  it("returns a non-empty cook-time label, CTA and badge for every recipe type", () => {
    for (const type of ALL_TYPES) {
      expect(cookTimeLabelFor(type)).toBeTruthy();
      expect(ctaLabelFor(type)).toBeTruthy();
      const badge = recipeTypeBadgeFor(type);
      expect(badge.label).toBeTruthy();
      expect(badge.emoji).toBeTruthy();
    }
  });

  it("maps the cocktail type to its own badge, mixing CTA and prep-time label", () => {
    expect(recipeTypeBadgeFor("cocktail")).toEqual({
      label: "Cocktail",
      emoji: "🍸",
    });
    expect(ctaLabelFor("cocktail")).toBe("Jetzt mixen");
    expect(cookTimeLabelFor("cocktail")).toBe("Zubereitungszeit");
  });
});
