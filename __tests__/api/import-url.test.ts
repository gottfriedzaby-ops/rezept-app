import { NextRequest } from "next/server";

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
import { checkUrlDuplicate } from "@/lib/duplicate-check";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";

const checkUrlDuplicateMock = checkUrlDuplicate as jest.Mock;
const parseRecipeMock = parseRecipeFromText as jest.Mock;
const reviewMock = reviewAndImproveRecipe as jest.Mock;

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/import-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a Response-like object for the global fetch mock. */
function fetchResponse(status: number, body = "", ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    text: async () => body,
    json: async () => ({}),
  } as unknown as Response;
}

beforeEach(() => {
  checkUrlDuplicateMock.mockReset();
  checkUrlDuplicateMock.mockResolvedValue(null);
  parseRecipeMock.mockReset();
  reviewMock.mockReset();
});

afterEach(() => {
  delete (global as unknown as { fetch?: typeof fetch }).fetch;
});

describe("POST /api/import-url — request validation and error paths", () => {
  it("returns 400 when the body has no url", async () => {
    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("url is required");
  });

  it("returns 409 with duplicate info when checkUrlDuplicate finds an existing recipe", async () => {
    checkUrlDuplicateMock.mockResolvedValueOnce({
      existingRecipeId: "abc-123",
      existingTitle: "Tomatensoße",
    });

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("duplicate");
    expect(body.existingRecipeId).toBe("abc-123");
    expect(body.existingTitle).toBe("Tomatensoße");
  });

  it("passes the authenticated userId to checkUrlDuplicate (scoping invariant)", async () => {
    global.fetch = jest.fn().mockResolvedValue(fetchResponse(404)) as unknown as typeof fetch;

    await POST(makeRequest({ url: "https://example.com/recipe" }));

    expect(checkUrlDuplicateMock).toHaveBeenCalledWith(
      "https://example.com/recipe",
      "test-user-id"
    );
  });

  it("returns the Cloudflare-blocked message when all fetch attempts return a bot-block status", async () => {
    // All 3 attempts (Googlebot UA, Browser UA, Jina Reader) return 403
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(403)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://protected.example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Cloudflare/);
  });

  it("returns the generic load-failure message when fetches return a non-block error status", async () => {
    // Status 404 — not a bot block, just a missing page. All attempts fail.
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(404)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://example.com/missing" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Seite konnte nicht geladen werden");
  });

  it("returns 500 when an unexpected error is thrown during processing", async () => {
    // Force checkUrlDuplicate to throw
    checkUrlDuplicateMock.mockRejectedValueOnce(new Error("unexpected DB failure"));

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("unexpected DB failure");
  });

  it("does not call Claude when the URL fetch fails entirely", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(500)) as unknown as typeof fetch;

    await POST(makeRequest({ url: "https://example.com/down" }));

    expect(parseRecipeMock).not.toHaveBeenCalled();
    expect(reviewMock).not.toHaveBeenCalled();
  });
});

// AO-12-1: review pass skipped when JSON-LD is solid and parse output is sound
describe("POST /api/import-url — review-pass skip (AO-12-1)", () => {
  function htmlWithJsonLd(jsonLd: object): string {
    return `<!doctype html><html><head><title>R</title><script type="application/ld+json">${JSON.stringify(
      { "@type": "Recipe", ...jsonLd }
    )}</script></head><body><h1>R</h1><p>some text</p></body></html>`;
  }

  function htmlWithoutJsonLd(): string {
    return `<!doctype html><html><head><title>R</title></head><body><h1>R</h1><p>plain html, no schema.org data, ingredients: 200 g Tomaten. Steps: kochen.</p></body></html>`;
  }

  function structurallySoundParse() {
    return {
      recipe: {
        title: "Tomatensoße",
        servings: 4,
        prepTime: 10,
        cookTime: 30,
        recipe_type: "kochen",
        sections: [
          {
            title: null,
            ingredients: [{ amount: 50, unit: "g", name: "Tomaten" }],
            steps: [{ order: 1, text: "Kochen.", timerSeconds: null }],
          },
        ],
        tags: ["einfach"],
        source: { type: "url", value: "https://example.com/recipe" },
      },
      meta: {},
    };
  }

  it("skips the review pass when JSON-LD has ingredients + instructions and parse pass is sound", async () => {
    const jsonLd = {
      name: "Tomatensoße",
      recipeIngredient: ["200 g Tomaten", "1 Zwiebel"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Kochen." }],
      recipeYield: "4",
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(200, htmlWithJsonLd(jsonLd))) as unknown as typeof fetch;
    parseRecipeMock.mockResolvedValueOnce(structurallySoundParse());

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));

    expect(res.status).toBe(200);
    expect(parseRecipeMock).toHaveBeenCalledTimes(1);
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it("still runs the review pass when JSON-LD is absent (HTML-only source)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(200, htmlWithoutJsonLd())) as unknown as typeof fetch;
    parseRecipeMock.mockResolvedValueOnce(structurallySoundParse());
    reviewMock.mockResolvedValueOnce(structurallySoundParse());

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));

    expect(res.status).toBe(200);
    expect(parseRecipeMock).toHaveBeenCalledTimes(1);
    expect(reviewMock).toHaveBeenCalledTimes(1);
  });

  it("still runs the review pass when JSON-LD is missing recipeInstructions", async () => {
    const jsonLd = {
      name: "Tomatensoße",
      recipeIngredient: ["200 g Tomaten"],
      // recipeInstructions intentionally absent
      recipeYield: "4",
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(200, htmlWithJsonLd(jsonLd))) as unknown as typeof fetch;
    parseRecipeMock.mockResolvedValueOnce(structurallySoundParse());
    reviewMock.mockResolvedValueOnce(structurallySoundParse());

    await POST(makeRequest({ url: "https://example.com/recipe" }));

    expect(reviewMock).toHaveBeenCalledTimes(1);
  });

  it("still runs the review pass when parse-pass returns a section with no ingredients", async () => {
    const jsonLd = {
      recipeIngredient: ["X"],
      recipeInstructions: [{ text: "Y" }],
      recipeYield: "4",
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(200, htmlWithJsonLd(jsonLd))) as unknown as typeof fetch;
    const broken = structurallySoundParse();
    broken.recipe.sections[0].ingredients = [];
    parseRecipeMock.mockResolvedValueOnce(broken);
    reviewMock.mockResolvedValueOnce(structurallySoundParse());

    await POST(makeRequest({ url: "https://example.com/recipe" }));

    expect(reviewMock).toHaveBeenCalledTimes(1);
  });
});
