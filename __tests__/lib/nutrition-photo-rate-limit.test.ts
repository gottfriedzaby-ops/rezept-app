jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

// Avoid loading the real Claude module (instantiates the Anthropic SDK).
jest.mock("@/lib/claude", () => ({
  PHOTO_NUTRITION_FUNCTION: "estimateNutritionFromPhoto",
}));

import {
  checkDailyPhotoEstimateLimit,
  photoEstimateRateLimitErrorMessage,
  DAILY_PHOTO_ESTIMATE_LIMIT,
} from "@/lib/nutrition-photo-rate-limit";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

/** from().select().eq().eq().gte() → { count, error } */
function makeCountChain(result: { count: number | null; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue(result),
  };
}

function setAuthenticated(userId = "u1") {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: userId } } }) },
  });
}
function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  });
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("checkDailyPhotoEstimateLimit", () => {
  it("denies and reports no user when unauthenticated", async () => {
    setUnauthenticated();
    const res = await checkDailyPhotoEstimateLimit();
    expect(res).toEqual({ userId: null, allowed: false, count: 0, remaining: 0 });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("allows when below the limit and reports remaining", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain({ count: 3, error: null }));
    const res = await checkDailyPhotoEstimateLimit();
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(3);
    expect(res.remaining).toBe(DAILY_PHOTO_ESTIMATE_LIMIT - 3);
  });

  it("blocks once the limit is reached", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain({ count: DAILY_PHOTO_ESTIMATE_LIMIT, error: null }));
    const res = await checkDailyPhotoEstimateLimit();
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("filters by the photo function and counts from UTC midnight", async () => {
    setAuthenticated();
    const chain = makeCountChain({ count: 0, error: null });
    fromMock.mockReturnValueOnce(chain);
    await checkDailyPhotoEstimateLimit();
    expect(chain.eq.mock.calls).toContainEqual(["function", "estimateNutritionFromPhoto"]);
    const gteArgs = chain.gte.mock.calls[0];
    expect(gteArgs[0]).toBe("created_at");
    expect(gteArgs[1]).toMatch(/T00:00:00\.000Z$/);
  });

  it("fails open when the tracking table is missing", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain({ count: null, error: { code: "42P01", message: "missing" } }));
    const res = await checkDailyPhotoEstimateLimit();
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(0);
  });
});

describe("photoEstimateRateLimitErrorMessage", () => {
  it("returns the German limit message with the count", () => {
    const msg = photoEstimateRateLimitErrorMessage({
      userId: "u1",
      allowed: false,
      count: DAILY_PHOTO_ESTIMATE_LIMIT,
      remaining: 0,
    });
    expect(msg).toContain("Tageslimit erreicht");
    expect(msg).toContain(String(DAILY_PHOTO_ESTIMATE_LIMIT));
  });
});
