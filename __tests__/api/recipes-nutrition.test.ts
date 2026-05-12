import { NextRequest } from "next/server";
import { POST } from "@/app/api/recipes/[id]/nutrition/route";
import type { Recipe } from "@/types/recipe";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/claude", () => ({
  estimateNutrition: jest.fn(),
}));

import { supabaseAdmin } from "@/lib/supabase";
import { estimateNutrition } from "@/lib/claude";

const fromMock = supabaseAdmin.from as jest.Mock;
const estimateNutritionMock = estimateNutrition as jest.Mock;

const RECIPE_ID = "recipe-uuid-123";

function makeRequest() {
  return new NextRequest(`http://localhost/api/recipes/${RECIPE_ID}/nutrition`, {
    method: "POST",
  });
}

function makeParams() {
  return { params: { id: RECIPE_ID } };
}

/** select("*").eq("id", id).single() */
function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

/** update(...).eq("id", id) */
function makeUpdateChain(result: { error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue(result),
  };
}

/** A minimal valid Recipe row from the DB. */
function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: RECIPE_ID,
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
    ingredients: [],
    steps: [],
    tags: [],
    source_type: "manual",
    source_value: "manual",
    scalable: true,
    favorite: false,
    image_url: null,
    step_images: null,
    user_id: "test-user-id",
    is_private: false,
    kcal_per_serving: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    nutrition_breakdown: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  } as Recipe;
}

const nutritionResult = {
  kcal_per_serving: 350,
  protein_g: 12,
  carbs_g: 45,
  fat_g: 8,
};

beforeEach(() => {
  fromMock.mockReset();
  estimateNutritionMock.mockReset();
  estimateNutritionMock.mockResolvedValue(nutritionResult);
});

describe("POST /api/recipes/[id]/nutrition", () => {
  // NR-01
  it("returns 404 when the recipe is not found", async () => {
    fromMock.mockReturnValueOnce(
      makeSelectChain({ data: null, error: { message: "no rows" } })
    );

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.data).toBeNull();
    expect(body.error).toBe("Rezept nicht gefunden");
    expect(estimateNutritionMock).not.toHaveBeenCalled();
  });

  // NR-02
  it("returns 400 when servings is 0", async () => {
    const recipe = makeRecipe({ servings: 0 });
    fromMock.mockReturnValueOnce(makeSelectChain({ data: recipe, error: null }));

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Portionszahl/);
    expect(estimateNutritionMock).not.toHaveBeenCalled();
  });

  // NR-03
  it("returns 400 when there are no ingredients", async () => {
    const recipe = makeRecipe({
      sections: [{ title: null, ingredients: [], steps: [] }],
      ingredients: [],
    });
    fromMock.mockReturnValueOnce(makeSelectChain({ data: recipe, error: null }));

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(estimateNutritionMock).not.toHaveBeenCalled();
  });

  // NR-04
  it("returns 200 with nutrition values and writes them to the DB", async () => {
    const recipe = makeRecipe();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: recipe, error: null }));
    const updateChain = makeUpdateChain({ error: null });
    fromMock.mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(nutritionResult);
    expect(body.error).toBeNull();

    expect((updateChain.update as jest.Mock).mock.calls[0][0]).toEqual(nutritionResult);
    expect((updateChain.eq as jest.Mock).mock.calls[0]).toEqual(["id", RECIPE_ID]);
  });

  // NR-04 extra: DB update failure does not block the response
  it("still returns 200 even when the DB update fails (best-effort write)", async () => {
    const recipe = makeRecipe();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: recipe, error: null }));
    fromMock.mockReturnValueOnce(makeUpdateChain({ error: { message: "missing columns" } }));

    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(nutritionResult);

    consoleError.mockRestore();
  });

  // NR-05
  it("returns 500 when estimateNutrition throws", async () => {
    const recipe = makeRecipe();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: recipe, error: null }));
    estimateNutritionMock.mockRejectedValueOnce(new Error("Claude API error"));

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.data).toBeNull();
    expect(body.error).toBe("Claude API error");
  });

  // NR-06
  it("passes all ingredients from every section to estimateNutrition", async () => {
    const recipe = makeRecipe({
      sections: [
        {
          title: "Teig",
          ingredients: [
            { amount: 200, unit: "g", name: "Mehl" },
            { amount: 100, unit: "ml", name: "Wasser" },
          ],
          steps: [],
        },
        {
          title: "Füllung",
          ingredients: [
            { amount: 100, unit: "g", name: "Zucker" },
            { amount: 50, unit: "g", name: "Butter" },
          ],
          steps: [],
        },
      ],
    });
    fromMock.mockReturnValueOnce(makeSelectChain({ data: recipe, error: null }));
    fromMock.mockReturnValueOnce(makeUpdateChain({ error: null }));

    await POST(makeRequest(), makeParams());

    expect(estimateNutritionMock).toHaveBeenCalledTimes(1);
    const [ingredients, servings] = estimateNutritionMock.mock.calls[0];
    expect(ingredients).toHaveLength(4);
    expect(ingredients.map((i: { name: string }) => i.name)).toEqual([
      "Mehl",
      "Wasser",
      "Zucker",
      "Butter",
    ]);
    expect(servings).toBe(4);
  });
});
