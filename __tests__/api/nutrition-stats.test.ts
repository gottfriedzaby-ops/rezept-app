import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET } from "@/app/api/nutrition/stats/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";
/** Both the route and these tests read "today" from the same clock. */
const TODAY = new Date().toISOString().slice(0, 10);

function setAuthenticated(id: string = USER_ID) {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id } } }) },
  });
}
function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  });
}

/** entries: select().eq().gte().lte().order() */
function makeEntriesChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  };
}
/** profile: select().eq().maybeSingle() */
function makeSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

function getRequest(range?: string) {
  const url = range
    ? `http://localhost/api/nutrition/stats?range=${range}`
    : "http://localhost/api/nutrition/stats";
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("GET /api/nutrition/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET(getRequest("week"));
    expect(res.status).toBe(401);
  });

  it("aggregates the range and returns the per-day target", async () => {
    setAuthenticated();
    const entries = [
      { date: TODAY, kcal_per_serving: 1000, protein_g: 50, carbs_g: 100, fat_g: 30, servings: 1 },
    ];
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: entries, error: null }));
    fromMock.mockReturnValueOnce(
      makeSingleChain({
        data: { target_kcal: 2000, target_protein_g: 100, target_carbs_g: 250, target_fat_g: 70 },
        error: null,
      })
    );

    const res = await GET(getRequest("week"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.summary.range).toBe("week");
    expect(body.data.summary.buckets).toHaveLength(7);
    expect(body.data.summary.daysLogged).toBe(1);
    expect(body.data.summary.totalEntries).toBe(1);
    expect(body.data.summary.averages.kcal).toBe(1000);
    expect(body.data.target.kcal).toBe(2000);
  });

  it("defaults to the week range for an invalid range param", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: [], error: null }));
    fromMock.mockReturnValueOnce(makeSingleChain({ data: null, error: null }));

    const res = await GET(getRequest("nonsense"));
    const body = await res.json();
    expect(body.data.summary.range).toBe("week");
    expect(body.data.summary.buckets).toHaveLength(7);
  });

  it("returns 30 daily buckets for the month range", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: [], error: null }));
    fromMock.mockReturnValueOnce(makeSingleChain({ data: null, error: null }));

    const res = await GET(getRequest("month"));
    const body = await res.json();
    expect(body.data.summary.range).toBe("month");
    expect(body.data.summary.buckets).toHaveLength(30);
  });

  it("returns a null target when no profile is set", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: [], error: null }));
    fromMock.mockReturnValueOnce(makeSingleChain({ data: null, error: null }));

    const res = await GET(getRequest("week"));
    const body = await res.json();
    expect(body.data.target).toBeNull();
    expect(body.data.summary.averages).toBeNull();
  });

  it("degrades gracefully when the diary table is missing", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: null, error: { code: "42P01" } }));
    fromMock.mockReturnValueOnce(makeSingleChain({ data: null, error: { code: "42P01" } }));

    const res = await GET(getRequest("week"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.summary.daysLogged).toBe(0);
    expect(body.data.summary.buckets).toHaveLength(7);
    expect(body.data.target).toBeNull();
  });
});
