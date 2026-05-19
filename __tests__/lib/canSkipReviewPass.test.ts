import { decideSkipReviewPass } from "@/lib/canSkipReviewPass";
import type { ParsedRecipe } from "@/types/recipe";
import type { JsonLdRecipeData } from "@/lib/claude";

function makeParsed(overrides: Partial<ParsedRecipe> = {}): ParsedRecipe {
  return {
    title: "Tomatensoße",
    servings: 4,
    prepTime: 10,
    cookTime: 30,
    recipe_type: "kochen",
    sections: [
      {
        title: null,
        ingredients: [{ amount: 200, unit: "g", name: "Tomaten" }],
        steps: [{ order: 1, text: "Kochen.", timerSeconds: null }],
      },
    ],
    tags: ["einfach"],
    source: { type: "url", value: "https://example.com" },
    ...overrides,
  };
}

const validJsonLd: JsonLdRecipeData = {
  name: "Tomatensoße",
  recipeIngredient: ["200 g Tomaten", "1 Zwiebel"],
  recipeInstructions: [{ text: "Zwiebel hacken." }, { text: "Anbraten." }],
  recipeYield: "4",
};

describe("decideSkipReviewPass", () => {
  it("skips when JSON-LD is solid and parse pass is structurally complete", () => {
    expect(decideSkipReviewPass(makeParsed(), validJsonLd)).toEqual({
      skip: true,
      reason: "jsonld-and-parse-pass-look-solid",
    });
  });

  it("does NOT skip when no JSON-LD is present", () => {
    expect(decideSkipReviewPass(makeParsed(), null)).toEqual({
      skip: false,
      reason: "no-jsonld",
    });
    expect(decideSkipReviewPass(makeParsed(), undefined)).toEqual({
      skip: false,
      reason: "no-jsonld",
    });
  });

  it("does NOT skip when JSON-LD has no recipeIngredient", () => {
    const jsonLd = { ...validJsonLd, recipeIngredient: undefined };
    expect(decideSkipReviewPass(makeParsed(), jsonLd).skip).toBe(false);
    expect(decideSkipReviewPass(makeParsed(), jsonLd).reason).toBe(
      "jsonld-missing-ingredients"
    );
  });

  it("does NOT skip when JSON-LD recipeIngredient is empty / whitespace-only", () => {
    expect(
      decideSkipReviewPass(makeParsed(), { ...validJsonLd, recipeIngredient: [] }).skip
    ).toBe(false);
    expect(
      decideSkipReviewPass(makeParsed(), { ...validJsonLd, recipeIngredient: ["   "] }).skip
    ).toBe(false);
  });

  it("does NOT skip when JSON-LD recipeInstructions are missing or empty", () => {
    expect(
      decideSkipReviewPass(makeParsed(), { ...validJsonLd, recipeInstructions: undefined }).reason
    ).toBe("jsonld-missing-instructions");
    expect(
      decideSkipReviewPass(makeParsed(), { ...validJsonLd, recipeInstructions: [] }).skip
    ).toBe(false);
    expect(
      decideSkipReviewPass(makeParsed(), {
        ...validJsonLd,
        recipeInstructions: [{ text: "  " }],
      }).skip
    ).toBe(false);
  });

  it("accepts string-form recipeInstructions", () => {
    const jsonLd: JsonLdRecipeData = {
      ...validJsonLd,
      recipeInstructions: ["Schritt 1.", "Schritt 2."],
    };
    expect(decideSkipReviewPass(makeParsed(), jsonLd).skip).toBe(true);
  });

  it("does NOT skip when parse-pass servings is 0 / negative / missing", () => {
    expect(decideSkipReviewPass(makeParsed({ servings: 0 }), validJsonLd).reason).toBe(
      "parse-pass-missing-servings"
    );
    expect(decideSkipReviewPass(makeParsed({ servings: -1 }), validJsonLd).skip).toBe(false);
  });

  it("does NOT skip when parse-pass produced no sections", () => {
    expect(
      decideSkipReviewPass(makeParsed({ sections: [] }), validJsonLd).reason
    ).toBe("parse-pass-empty-sections");
  });

  it("does NOT skip when any section has no ingredients or no steps", () => {
    const noIng = makeParsed({
      sections: [
        {
          title: null,
          ingredients: [],
          steps: [{ order: 1, text: "Kochen.", timerSeconds: null }],
        },
      ],
    });
    const noStep = makeParsed({
      sections: [
        {
          title: null,
          ingredients: [{ amount: 1, unit: "", name: "Salz" }],
          steps: [],
        },
      ],
    });
    const blankNames = makeParsed({
      sections: [
        {
          title: null,
          ingredients: [{ amount: 1, unit: "", name: "  " }],
          steps: [{ order: 1, text: "Kochen.", timerSeconds: null }],
        },
      ],
    });

    expect(decideSkipReviewPass(noIng, validJsonLd).reason).toBe(
      "parse-pass-section-missing-content"
    );
    expect(decideSkipReviewPass(noStep, validJsonLd).reason).toBe(
      "parse-pass-section-missing-content"
    );
    expect(decideSkipReviewPass(blankNames, validJsonLd).reason).toBe(
      "parse-pass-section-missing-content"
    );
  });

  it("requires EVERY section to have content (not just one)", () => {
    const twoSections = makeParsed({
      sections: [
        {
          title: "Für die Soße",
          ingredients: [{ amount: 200, unit: "g", name: "Tomaten" }],
          steps: [{ order: 1, text: "Kochen.", timerSeconds: null }],
        },
        {
          title: "Für die Pasta",
          ingredients: [],
          steps: [{ order: 1, text: "Salzwasser kochen.", timerSeconds: null }],
        },
      ],
    });
    expect(decideSkipReviewPass(twoSections, validJsonLd).skip).toBe(false);
  });
});
