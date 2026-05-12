import {
  checkDailyImportLimit,
  rateLimitErrorMessage,
  DAILY_IMPORT_LIMIT,
} from "@/lib/import-rate-limit";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

/** Mock the supabaseAdmin count chain: from().select().eq().gte() → { count } */
function makeCountChain(count: number | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue({ count, error: null }),
  };
}

function setAuthenticated(userId = "u1") {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: userId } } }),
    },
  });
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  });
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("checkDailyImportLimit", () => {
  // RL-01
  it("returns allowed=true with correct remaining count when user is under the limit", async () => {
    setAuthenticated("u1");
    fromMock.mockReturnValueOnce(makeCountChain(5));

    const result = await checkDailyImportLimit();

    expect(result).toEqual({
      userId: "u1",
      allowed: true,
      count: 5,
      remaining: 15,
    });
  });

  // RL-02
  it("returns allowed=true at exactly count=19 (one import remaining)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain(19));

    const result = await checkDailyImportLimit();

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(19);
    expect(result.remaining).toBe(1);
  });

  // RL-03
  it("returns allowed=false at exactly count=20", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain(DAILY_IMPORT_LIMIT));

    const result = await checkDailyImportLimit();

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(20);
    expect(result.remaining).toBe(0);
  });

  // RL-04
  it("clamps remaining to 0 when count is over the limit", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain(25));

    const result = await checkDailyImportLimit();

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(25);
    expect(result.remaining).toBe(0);
  });

  // RL-05
  it("returns userId=null and skips the DB count query when unauthenticated", async () => {
    setUnauthenticated();

    const result = await checkDailyImportLimit();

    expect(result).toEqual({
      userId: null,
      allowed: false,
      count: 0,
      remaining: 0,
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  // RL-06
  it("uses UTC midnight of the current day as the count window start", async () => {
    setAuthenticated();
    const chain = makeCountChain(0);
    fromMock.mockReturnValueOnce(chain);

    await checkDailyImportLimit();

    const gteArgs = (chain.gte as jest.Mock).mock.calls[0];
    expect(gteArgs[0]).toBe("created_at");
    // ISO string ending in T00:00:00.000Z (UTC midnight)
    expect(gteArgs[1]).toMatch(/T00:00:00\.000Z$/);
  });

  it("scopes the count query to the authenticated user's id", async () => {
    setAuthenticated("user-xyz");
    const chain = makeCountChain(0);
    fromMock.mockReturnValueOnce(chain);

    await checkDailyImportLimit();

    expect((chain.eq as jest.Mock).mock.calls).toContainEqual(["user_id", "user-xyz"]);
  });

  // RL-07
  it("treats a null count from the DB as 0 imports today", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeCountChain(null));

    const result = await checkDailyImportLimit();

    expect(result.count).toBe(0);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(20);
  });
});

describe("rateLimitErrorMessage", () => {
  // RL-08
  it("returns 'Nicht angemeldet' when userId is null", () => {
    const msg = rateLimitErrorMessage({
      userId: null,
      allowed: false,
      count: 0,
      remaining: 0,
    });
    expect(msg).toBe("Nicht angemeldet");
  });

  // RL-09
  it("returns a German message with the count and UTC midnight reset notice when over the limit", () => {
    const msg = rateLimitErrorMessage({
      userId: "u1",
      allowed: false,
      count: 20,
      remaining: 0,
    });
    expect(msg).toContain("20 von 20");
    expect(msg).toContain("Mitternacht (UTC)");
  });
});
