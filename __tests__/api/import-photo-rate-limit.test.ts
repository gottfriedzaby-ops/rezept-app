import { NextRequest } from "next/server";

jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn(),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

jest.mock("@/lib/duplicate-check", () => ({
  findDuplicateRecipe: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/claude", () => ({
  parseRecipeFromImage: jest.fn().mockResolvedValue({ recipe: {} }),
  parseRecipeFromImages: jest.fn().mockResolvedValue({ recipe: {} }),
  reviewAndImproveRecipe: jest.fn().mockResolvedValue({ recipe: {} }),
}));

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { storage: { from: jest.fn() } },
}));

jest.mock("heic-convert", () => jest.fn());

import { POST } from "@/app/api/import-photo/route";
import { checkDailyImportLimit } from "@/lib/import-rate-limit";

const checkRateLimitMock = checkDailyImportLimit as jest.Mock;

function makeJsonRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/import-photo", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  checkRateLimitMock.mockReset();
});

describe("POST /api/import-photo — rate limit gate", () => {
  // IP-01
  it("returns 401 when unauthenticated", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: null,
      allowed: false,
      count: 0,
      remaining: 0,
    });

    const res = await POST(makeJsonRequest());
    expect(res.status).toBe(401);
  });

  // IP-02
  it("returns 429 when the daily limit is reached", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: false,
      count: 20,
      remaining: 0,
    });

    const res = await POST(makeJsonRequest());
    expect(res.status).toBe(429);
  });

  // IP-03
  it("proceeds past the rate limit gate when allowed", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: "u1",
      allowed: true,
      count: 5,
      remaining: 15,
    });

    const res = await POST(makeJsonRequest({ urls: [], fileNames: [] }));

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(429);
  });
});
