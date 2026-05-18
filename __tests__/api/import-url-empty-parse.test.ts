import { NextRequest } from "next/server";
import type { ParsedRecipe, RecipeSection } from "@/types/recipe";

jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn().mockResolvedValue({
    userId: "test-user-id",
    allowed: true,
    count: 0,
    remaining: 20,
  }),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

jest.mock("@/lib/duplicate-check", () => ({
  checkUrlDuplicate: jest.fn().mockResolvedValue(null),
  findDuplicateRecipe: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/claude", () => ({
  parseRecipeFromText: jest.fn(),
  reviewAndImproveRecipe: jest.fn(),
}));

import { POST } from "@/app/api/import-url/route";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";

const parseRecipeMock = parseRecipeFromText as jest.Mock;
const reviewMock = reviewAndImproveRecipe as jest.Mock;

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/import-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function fetchResponse(status: number, body = "", ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

function makeRecipe(sections: RecipeSection[]): ParsedRecipe {
  return {
    title: "Bananenmilch",
    servings: 1,
    prepTime: 0,
    cookTime: 0,
    recipe_type: "zubereiten",
    sections,
    tags: ["getränk", "frühstück"],
    source: { type: "url", value: "https://example.com/recipe" },
  };
}

beforeEach(() => {
  parseRecipeMock.mockReset();
  reviewMock.mockReset();
  // Minimal valid HTML response so the fetch pipeline reaches the Claude stage.
  global.fetch = jest.fn().mockResolvedValue(
    fetchResponse(200, "<html><body><h1>Recipe</h1><p>some content</p></body></html>")
  ) as unknown as typeof fetch;
});

afterEach(() => {
  delete (global as unknown as { fetch?: typeof fetch }).fetch;
});

describe("POST /api/import-url — EMPTY_PARSE detection (FR-15)", () => {
  it("returns EMPTY_PARSE when all sections have no ingredients and no steps", async () => {
    const empty = makeRecipe([{ title: null, ingredients: [], steps: [] }]);
    parseRecipeMock.mockResolvedValueOnce({ recipe: empty });
    reviewMock.mockResolvedValueOnce({ recipe: empty });

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBe("EMPTY_PARSE");
    expect(body.data).toBeNull();
  });

  it("returns EMPTY_PARSE when sections array is empty", async () => {
    const empty = makeRecipe([]);
    parseRecipeMock.mockResolvedValueOnce({ recipe: empty });
    reviewMock.mockResolvedValueOnce({ recipe: empty });

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBe("EMPTY_PARSE");
  });

  it("does NOT return EMPTY_PARSE when ingredients exist but steps are missing (partial recipe is still valid)", async () => {
    const partial = makeRecipe([
      {
        title: null,
        ingredients: [{ amount: 200, unit: "ml", name: "Milch" }],
        steps: [],
      },
    ]);
    parseRecipeMock.mockResolvedValueOnce({ recipe: partial });
    reviewMock.mockResolvedValueOnce({ recipe: partial });

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data?.recipe).toBeTruthy();
  });

  it("does NOT return EMPTY_PARSE when steps exist but ingredients are missing", async () => {
    const partial = makeRecipe([
      {
        title: null,
        ingredients: [],
        steps: [{ order: 1, text: "Etwas tun.", timerSeconds: null }],
      },
    ]);
    parseRecipeMock.mockResolvedValueOnce({ recipe: partial });
    reviewMock.mockResolvedValueOnce({ recipe: partial });

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
  });

  it("aggregates ingredients/steps across sections (multi-section recipe is non-empty if any section has content)", async () => {
    const multiSection = makeRecipe([
      { title: "Teig", ingredients: [], steps: [] },
      {
        title: "Belag",
        ingredients: [{ amount: 100, unit: "g", name: "Tomaten" }],
        steps: [{ order: 1, text: "Belegen.", timerSeconds: null }],
      },
    ]);
    parseRecipeMock.mockResolvedValueOnce({ recipe: multiSection });
    reviewMock.mockResolvedValueOnce({ recipe: multiSection });

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
  });
});
