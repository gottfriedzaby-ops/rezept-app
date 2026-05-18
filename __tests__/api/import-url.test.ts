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

  it("returns FETCH_BLOCKED (HTTP 200) when all fetch attempts return a bot-block status", async () => {
    // FR-15: bot-block surfaces as the same actionable error page as other fetch failures.
    // All 3 attempts (Googlebot UA, Browser UA, Jina Reader) return 403.
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(403)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://protected.example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBe("FETCH_BLOCKED");
    expect(body.data).toBeNull();
  });

  it("returns FETCH_BLOCKED (HTTP 200) when fetches return a non-block error status", async () => {
    // Status 404 — not a bot block, just a missing page. Still maps to FETCH_BLOCKED
    // because user-visible recovery is identical (manual entry or different URL).
    global.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(404)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://example.com/missing" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBe("FETCH_BLOCKED");
    expect(body.data).toBeNull();
  });

  it("returns EMPTY_PARSE (HTTP 200) when an unexpected error is thrown during processing", async () => {
    // FR-08: generic exceptions surface as EMPTY_PARSE to the user; stack stays in server log.
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    checkUrlDuplicateMock.mockRejectedValueOnce(new Error("unexpected DB failure"));

    const res = await POST(makeRequest({ url: "https://example.com/recipe" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBe("EMPTY_PARSE");
    expect(body.data).toBeNull();
    consoleSpy.mockRestore();
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
