jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import {
  checkDailyFoodLookupLimit,
  foodLookupRateLimitErrorMessage,
  DAILY_FOOD_LOOKUP_LIMIT,
} from "@/lib/food-lookup-rate-limit";
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

describe("checkDailyFoodLookupLimit", () => {
  it("denies and reports no user when unauthenticated", async () => {
    setUnauthenticated();
    const res = await checkDailyFoodLookupLimit();
    expect(res).toEqual({ userId: null, allowed: false, count: 0, remaining: 0 });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("allows when below the limit and reports remaining", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain({ count: 5, error: null }));
    const res = await checkDailyFoodLookupLimit();
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(5);
    expect(res.remaining).toBe(DAILY_FOOD_LOOKUP_LIMIT - 5);
  });

  it("blocks once the limit is reached", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain({ count: DAILY_FOOD_LOOKUP_LIMIT, error: null }));
    const res = await checkDailyFoodLookupLimit();
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("filters by the lookup function and counts from UTC midnight", async () => {
    setAuthenticated();
    const chain = makeCountChain({ count: 0, error: null });
    fromMock.mockReturnValueOnce(chain);
    await checkDailyFoodLookupLimit();
    expect(chain.eq.mock.calls).toContainEqual(["function", "lookupFoodNutrition"]);
    const gteArgs = chain.gte.mock.calls[0];
    expect(gteArgs[0]).toBe("created_at");
    expect(gteArgs[1]).toMatch(/T00:00:00\.000Z$/);
  });

  it("fails open when the tracking table is missing", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain({ count: null, error: { code: "42P01", message: "missing" } }));
    const res = await checkDailyFoodLookupLimit();
    expect(res.allowed).toBe(true);
    expect(res.count).toBe(0);
  });
});

describe("foodLookupRateLimitErrorMessage", () => {
  it("returns the German limit message with the count", () => {
    const msg = foodLookupRateLimitErrorMessage({
      userId: "u1",
      allowed: false,
      count: DAILY_FOOD_LOOKUP_LIMIT,
      remaining: 0,
    });
    expect(msg).toContain("Tageslimit erreicht");
    expect(msg).toContain(String(DAILY_FOOD_LOOKUP_LIMIT));
  });
});
