import { NextRequest } from "next/server";
import { POST } from "@/app/api/recipes/confirm/route";
import type { ParsedRecipe } from "@/types/recipe";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/duplicate-check", () => ({
  findDuplicateRecipe: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  }),
}));

import { supabaseAdmin } from "@/lib/supabase";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

const fromMock = supabaseAdmin.from as jest.Mock;
const findDuplicateMock = findDuplicateRecipe as jest.Mock;

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
  tags: ["pasta", "vegetarisch"],
  source: { type: "manual", value: "manual" },
};

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/recipes/confirm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeRateLimitChain(count = 0) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue({ count, data: null, error: null }),
  };
  return chain;
}

function makeDbChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  findDuplicateMock.mockReset();
  findDuplicateMock.mockResolvedValue(null);
  // First call to from() is always the rate-limit count check
  fromMock.mockReturnValueOnce(makeRateLimitChain(0));
});

describe("POST /api/recipes/confirm", () => {
  it("returns 400 when recipe field is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("returns 409 when findDuplicateRecipe detects a duplicate", async () => {
    findDuplicateMock.mockResolvedValue({
      existingRecipeId: "existing-id",
      existingTitle: "Tomatensoße",
    });

    const req = makeRequest({ recipe: validRecipe });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("duplicate");
    expect(body.existingRecipeId).toBe("existing-id");
  });

  it("calls findDuplicateRecipe with the recipe title and source value", async () => {
    fromMock.mockReturnValueOnce(makeDbChain({ data: { id: "new-id", title: "Tomatensoße" }, error: null }));

    const req = makeRequest({ recipe: validRecipe });
    await POST(req);

    expect(findDuplicateMock).toHaveBeenCalledWith("Tomatensoße", "manual", "test-user-id");
  });

  it("inserts the recipe and returns 200 with the saved data", async () => {
    const savedRecipe = { id: "new-id", title: "Tomatensoße" };
    fromMock.mockReturnValueOnce(makeDbChain({ data: savedRecipe, error: null }));

    const req = makeRequest({ recipe: validRecipe });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(savedRecipe);
    expect(body.error).toBeNull();
  });

  it("returns 500 when the database insert fails", async () => {
    fromMock.mockReturnValueOnce(makeDbChain({ data: null, error: { message: "DB error" } }));

    const req = makeRequest({ recipe: validRecipe });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
  });

  it("flattens multi-section ingredients into flat array for DB", async () => {
    const multiSectionRecipe: ParsedRecipe = {
      ...validRecipe,
      sections: [
        {
          title: "Teig",
          ingredients: [{ amount: 200, unit: "g", name: "Mehl" }],
          steps: [{ order: 1, text: "Mehl sieben.", timerSeconds: null }],
        },
        {
          title: "Füllung",
          ingredients: [{ amount: 100, unit: "g", name: "Zucker" }],
          steps: [{ order: 2, text: "Zucker schmelzen.", timerSeconds: null }],
        },
      ],
    };

    const insertMock = jest.fn().mockReturnThis();
    const selectMock = jest.fn().mockReturnThis();
    const singleMock = jest.fn().mockResolvedValue({
      data: { id: "new-id" },
      error: null,
    });

    fromMock.mockReturnValueOnce({
      insert: insertMock,
      select: selectMock,
      single: singleMock,
    });

    const req = makeRequest({ recipe: multiSectionRecipe });
    await POST(req);

    const insertedData = insertMock.mock.calls[0][0];
    expect(insertedData.ingredients).toHaveLength(2);
    expect(insertedData.steps).toHaveLength(2);
    expect(insertedData.sections).toHaveLength(2);
  });

  it("uses sourceTitle when provided", async () => {
    const insertMock = jest.fn().mockReturnThis();
    const selectMock = jest.fn().mockReturnThis();
    const singleMock = jest.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });

    fromMock.mockReturnValueOnce({ insert: insertMock, select: selectMock, single: singleMock });

    const req = makeRequest({ recipe: validRecipe, sourceTitle: "Mein Koch-Blog" });
    await POST(req);

    const insertedData = insertMock.mock.calls[0][0];
    expect(insertedData.source_title).toBe("Mein Koch-Blog");
  });

  it("sets scalable to true by default", async () => {
    const insertMock = jest.fn().mockReturnThis();
    const selectMock = jest.fn().mockReturnThis();
    const singleMock = jest.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });

    fromMock.mockReturnValueOnce({ insert: insertMock, select: selectMock, single: singleMock });

    const recipeWithoutScalable = { ...validRecipe };
    delete (recipeWithoutScalable as Partial<ParsedRecipe>).scalable;

    const req = makeRequest({ recipe: recipeWithoutScalable });
    await POST(req);

    const insertedData = insertMock.mock.calls[0][0];
    expect(insertedData.scalable).toBe(true);
  });
});
