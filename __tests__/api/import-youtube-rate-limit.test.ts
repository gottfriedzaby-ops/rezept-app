import { NextRequest } from "next/server";

jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn(),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

jest.mock("@/lib/duplicate-check", () => ({
  checkUrlDuplicate: jest.fn().mockResolvedValue(null),
  findDuplicateRecipe: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/claude", () => ({
  parseRecipeFromText: jest.fn().mockResolvedValue({ recipe: {} }),
  reviewAndImproveRecipe: jest.fn().mockResolvedValue({ recipe: {} }),
}));

jest.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: jest.fn().mockResolvedValue([]) },
}));

import { POST } from "@/app/api/import-youtube/route";
import { checkDailyImportLimit } from "@/lib/import-rate-limit";

const checkRateLimitMock = checkDailyImportLimit as jest.Mock;

function makeRequest(body: object = { url: "https://youtu.be/dQw4w9WgXcQ" }) {
  return new NextRequest("http://localhost/api/import-youtube", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  checkRateLimitMock.mockReset();
});

describe("POST /api/import-youtube — rate limit gate", () => {
  // IY-01
  it("returns 401 when unauthenticated", async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      userId: null,
      allowed: false,
      count: 0,
      remaining: 0,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  // IY-02
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

  // IY-03
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
