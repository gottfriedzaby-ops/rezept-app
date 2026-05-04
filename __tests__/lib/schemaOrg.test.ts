import { toSchemaOrgRecipe, toPlainText } from "@/lib/schemaOrg";
import type { Recipe } from "@/types/recipe";

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "test-id",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    title: "Tomatensoße",
    description: "Eine klassische Tomatensoße",
    servings: 4,
    prep_time: 10,
    cook_time: 30,
    recipe_type: "kochen",
    ingredients: [
      { amount: 800, unit: "g", name: "Tomaten" },
      { amount: 1, unit: "", name: "Zwiebel" },
    ],
    steps: [
      { order: 1, text: "Zwiebeln hacken.", timerSeconds: null },
      { order: 2, text: "30 Min. köcheln.", timerSeconds: 1800 },
    ],
    sections: null,
    tags: ["pasta", "vegetarisch"],
    source_type: "manual",
    source_value: "manual",
    source_title: null,
    image_url: null,
    step_images: null,
    favorite: false,
    scalable: true,
    ...overrides,
  };
}

describe("toSchemaOrgRecipe", () => {
  it("includes correct @context and @type", () => {
    const result = toSchemaOrgRecipe(makeRecipe()) as Record<string, unknown>;
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Recipe");
  });

  it("maps recipe title to name", () => {
    const result = toSchemaOrgRecipe(makeRecipe()) as Record<string, unknown>;
    expect(result.name).toBe("Tomatensoße");
  });

  it("formats prepTime as ISO 8601 duration", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ prep_time: 10 })) as Record<string, unknown>;
    expect(result.prepTime).toBe("PT10M");
  });

  it("formats cookTime as ISO 8601 duration", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ cook_time: 30 })) as Record<string, unknown>;
    expect(result.cookTime).toBe("PT30M");
  });

  it("omits prepTime when null", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ prep_time: null })) as Record<string, unknown>;
    expect(result.prepTime).toBeUndefined();
  });

  it("omits cookTime when null", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ cook_time: null })) as Record<string, unknown>;
    expect(result.cookTime).toBeUndefined();
  });

  it("maps servings as a string to recipeYield", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ servings: 4 })) as Record<string, unknown>;
    expect(result.recipeYield).toBe("4");
  });

  it("includes image_url when set", () => {
    const result = toSchemaOrgRecipe(
      makeRecipe({ image_url: "https://example.com/img.jpg" })
    ) as Record<string, unknown>;
    expect(result.image).toBe("https://example.com/img.jpg");
  });

  it("omits image when image_url is null", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ image_url: null })) as Record<string, unknown>;
    expect(result.image).toBeUndefined();
  });

  it("joins tags as keywords string", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ tags: ["pasta", "vegetarisch"] })) as Record<string, unknown>;
    expect(result.keywords).toBe("pasta, vegetarisch");
  });

  it("omits keywords for empty tags array", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ tags: [] })) as Record<string, unknown>;
    expect(result.keywords).toBeUndefined();
  });

  it("builds recipeIngredient strings from flat ingredients", () => {
    const result = toSchemaOrgRecipe(makeRecipe()) as Record<string, unknown>;
    const ingredients = result.recipeIngredient as string[];
    expect(ingredients).toContain("800 g Tomaten");
    expect(ingredients).toContain("1 Zwiebel");
  });

  it("sorts recipeInstructions by step order", () => {
    const recipe = makeRecipe({
      steps: [
        { order: 2, text: "Step two", timerSeconds: null },
        { order: 1, text: "Step one", timerSeconds: null },
      ],
    });
    const result = toSchemaOrgRecipe(recipe) as Record<string, unknown>;
    const steps = result.recipeInstructions as Array<{ "@type": string; text: string }>;
    expect(steps[0].text).toBe("Step one");
    expect(steps[1].text).toBe("Step two");
  });

  it("wraps each step as HowToStep", () => {
    const result = toSchemaOrgRecipe(makeRecipe()) as Record<string, unknown>;
    const steps = result.recipeInstructions as Array<{ "@type": string }>;
    expect(steps[0]["@type"]).toBe("HowToStep");
  });

  it("sets url for URL-sourced recipes", () => {
    const result = toSchemaOrgRecipe(
      makeRecipe({ source_type: "url", source_value: "https://example.com/recipe" })
    ) as Record<string, unknown>;
    expect(result.url).toBe("https://example.com/recipe");
  });

  it("omits url for non-URL sources", () => {
    const result = toSchemaOrgRecipe(makeRecipe({ source_type: "youtube", source_value: "abc123" })) as Record<string, unknown>;
    expect(result.url).toBeUndefined();
  });

  it("flattens multi-section recipe ingredients", () => {
    const recipe = makeRecipe({
      ingredients: [],
      steps: [],
      sections: [
        {
          title: "Teig",
          ingredients: [{ amount: 200, unit: "g", name: "Mehl" }],
          steps: [{ order: 1, text: "Mehl sieben.", timerSeconds: null }],
        },
        {
          title: "Füllung",
          ingredients: [{ amount: 100, unit: "g", name: "Zucker" }],
          steps: [{ order: 2, text: "Zucker karamellisieren.", timerSeconds: null }],
        },
      ],
    });
    const result = toSchemaOrgRecipe(recipe) as Record<string, unknown>;
    const ingredients = result.recipeIngredient as string[];
    expect(ingredients.length).toBe(2);
    expect(ingredients).toContain("200 g Mehl");
    expect(ingredients).toContain("100 g Zucker");
  });
});

describe("toPlainText", () => {
  it("starts with the recipe title", () => {
    const text = toPlainText(makeRecipe());
    expect(text.startsWith("Tomatensoße")).toBe(true);
  });

  it("includes the servings count", () => {
    expect(toPlainText(makeRecipe())).toContain("Portionen: 4");
  });

  it("includes prep time in minutes", () => {
    expect(toPlainText(makeRecipe())).toContain("Vorbereitung: 10 Min.");
  });

  it("includes cook time in minutes", () => {
    expect(toPlainText(makeRecipe())).toContain("Kochzeit: 30 Min.");
  });

  it("omits prep time line when null", () => {
    expect(toPlainText(makeRecipe({ prep_time: null }))).not.toContain("Vorbereitung:");
  });

  it("includes 'Zutaten' section header", () => {
    expect(toPlainText(makeRecipe())).toContain("Zutaten:");
  });

  it("lists ingredients with bullet points", () => {
    const text = toPlainText(makeRecipe());
    expect(text).toContain("• 800 g Tomaten");
    expect(text).toContain("• 1 Zwiebel");
  });

  it("includes 'Zubereitung' section header", () => {
    expect(toPlainText(makeRecipe())).toContain("Zubereitung:");
  });

  it("numbers steps sequentially from 1", () => {
    const text = toPlainText(makeRecipe());
    expect(text).toContain("1. Zwiebeln hacken.");
    expect(text).toContain("2. 30 Min. köcheln.");
  });

  it("sorts steps by order even if stored out of order", () => {
    const recipe = makeRecipe({
      steps: [
        { order: 2, text: "Step two", timerSeconds: null },
        { order: 1, text: "Step one", timerSeconds: null },
      ],
    });
    const text = toPlainText(recipe);
    const pos1 = text.indexOf("Step one");
    const pos2 = text.indexOf("Step two");
    expect(pos1).toBeLessThan(pos2);
  });

  it("shows '–' when servings is null", () => {
    expect(toPlainText(makeRecipe({ servings: null }))).toContain("Portionen: –");
  });
});
