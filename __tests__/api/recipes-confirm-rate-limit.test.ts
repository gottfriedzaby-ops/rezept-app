import { NextRequest } from "next/server";
import type { ParsedRecipe } from "@/types/recipe";

jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn(),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  }),
}));

jest.mock("@/lib/duplicate-check", () => ({
  findDuplicateRecipe: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/claude", () => ({
  estimateNutrition: jest.fn().mockResolvedValue({
    kcal_per_serving: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
  }),
}));

import { POST } from "@/app/api/recipes/confirm/route";
import { supabaseAdmin } from "@/lib/supabase";
import { checkDailyImportLimit } from "@/lib/import-rate-limit";

const fromMock = supabaseAdmin.from as jest.Mock;
const checkRateLimitMock = checkDailyImportLimit as jest.Mock;

const validRecipe: ParsedRecipe = {
  title: "Tomatensoße",
  servings: 4,
  prepTime: 10,
  cookTime: 30,
  recipe_type: "kochen",
  sections: [
    {
      title: null,
      ingredients: [{ amount: 800, unit: "g", name: "Tomaten" }],
      steps: [{ order: 1, text: "Tomaten kochen.", timerSeconds: null }],
    },
  ],
  tags: [],
  source: { type: "manual", value: "manual" },
};

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/recipes/confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeInsertChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  checkRateLimitMock.mockReset();
});

describe("POST /api/recipes/confirm — rate limit gate", () => {
  // RC-01
  it("returns 401 when unauthenticated and does not call the DB insert", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: null,
      allowed: false,
      count: 0,
      remaining: 0,
    });

    const res = await POST(makeRequest({ recipe: validRecipe }));

    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  // RC-02
  it("returns 429 when the daily limit is reached and does not call the DB insert", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: false,
      count: 20,
      remaining: 0,
    });

    const res = await POST(makeRequest({ recipe: validRecipe }));

    expect(res.status).toBe(429);
    expect(fromMock).not.toHaveBeenCalled();
  });

  // RC-03
  it("proceeds past the rate limit gate when allowed and attempts the DB insert", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: true,
      count: 5,
      remaining: 15,
    });
    fromMock.mockReturnValueOnce(makeInsertChain({ data: { id: "new" }, error: null }));

    const res = await POST(makeRequest({ recipe: validRecipe }));

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(429);
    expect(fromMock).toHaveBeenCalledWith("recipes");
  });

  // RC-04
  it("first request succeeds, second request after limit hit is blocked with 429", async () => {
    // First call: allowed=true (count 19, will become 20 after insert)
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: true,
      count: 19,
      remaining: 1,
    });
    fromMock.mockReturnValueOnce(makeInsertChain({ data: { id: "first" }, error: null }));

    const firstRes = await POST(makeRequest({ recipe: validRecipe }));
    expect(firstRes.status).toBe(200);

    // Second call: allowed=false (count now at 20)
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: false,
      count: 20,
      remaining: 0,
    });

    const secondRes = await POST(makeRequest({ recipe: validRecipe }));
    expect(secondRes.status).toBe(429);
  });
});
