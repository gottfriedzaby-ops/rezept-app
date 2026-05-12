import { NextRequest } from "next/server";

jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn(),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

// Stub out heavy/network dependencies so the route does not actually try to scrape.
jest.mock("@/lib/duplicate-check", () => ({
  checkUrlDuplicate: jest.fn().mockResolvedValue(null),
  findDuplicateRecipe: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/claude", () => ({
  parseRecipeFromText: jest.fn().mockResolvedValue({ recipe: {} }),
  reviewAndImproveRecipe: jest.fn().mockResolvedValue({ recipe: {} }),
}));

import { POST } from "@/app/api/import-url/route";
import { checkDailyImportLimit } from "@/lib/import-rate-limit";

const checkRateLimitMock = checkDailyImportLimit as jest.Mock;

function makeRequest(body: object = { url: "https://example.com/recipe" }) {
  return new NextRequest("http://localhost/api/import-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  checkRateLimitMock.mockReset();
});

describe("POST /api/import-url — rate limit gate", () => {
  // IU-01
  it("returns 401 when unauthenticated (rate limit reports userId=null)", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: null,
      allowed: false,
      count: 0,
      remaining: 0,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  // IU-02
  it("returns 429 when the daily limit is reached", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: false,
      count: 20,
      remaining: 0,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);
  });

  // IU-03
  it("proceeds past the rate limit gate when allowed", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: true,
      count: 5,
      remaining: 15,
    });

    const res = await POST(makeRequest({}));

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(429);
  });
});
