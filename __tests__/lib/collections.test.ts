jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { getCollectionsWithCounts } from "@/lib/collections";

const fromMock = supabaseAdmin.from as jest.Mock;

interface ChainCalls {
  select: unknown[][];
  eq: unknown[][];
  order: unknown[][];
}

/** Records builder calls; `.order()` resolves the query (the awaited step). */
function makeChain(result: { data: unknown; error: unknown }) {
  const calls: ChainCalls = { select: [], eq: [], order: [] };
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn((...args: unknown[]) => {
    calls.select.push(args);
    return chain;
  });
  chain.eq = jest.fn((...args: unknown[]) => {
    calls.eq.push(args);
    return chain;
  });
  chain.order = jest.fn((...args: unknown[]) => {
    calls.order.push(args);
    return Promise.resolve({ data: result.data, error: result.error });
  });
  return { chain, calls };
}

beforeEach(() => {
  fromMock.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getCollectionsWithCounts", () => {
  it("maps the aggregated recipe count onto recipe_count", async () => {
    const { chain } = makeChain({
      data: [
        {
          id: "c1",
          created_at: "2026-06-10T00:00:00Z",
          user_id: "user-1",
          name: "Wochenende",
          collection_recipes: [{ count: 3 }],
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(chain);

    const result = await getCollectionsWithCounts("user-1");

    expect(result).toEqual([
      {
        id: "c1",
        created_at: "2026-06-10T00:00:00Z",
        user_id: "user-1",
        name: "Wochenende",
        recipe_count: 3,
      },
    ]);
  });

  it("defaults recipe_count to 0 when no aggregate is present", async () => {
    const { chain } = makeChain({
      data: [
        {
          id: "c2",
          created_at: "2026-06-09T00:00:00Z",
          user_id: "user-1",
          name: "Leer",
          collection_recipes: null,
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(chain);

    const result = await getCollectionsWithCounts("user-1");

    expect(result[0].recipe_count).toBe(0);
  });

  it("scopes to the user and orders newest first", async () => {
    const { chain, calls } = makeChain({ data: [], error: null });
    fromMock.mockReturnValue(chain);

    await getCollectionsWithCounts("user-42");

    expect(fromMock).toHaveBeenCalledWith("collections");
    expect(calls.eq).toContainEqual(["user_id", "user-42"]);
    expect(calls.order).toContainEqual(["created_at", { ascending: false }]);
  });

  it("returns [] (and warns) when the table is missing (42P01)", async () => {
    const { chain } = makeChain({
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    });
    fromMock.mockReturnValue(chain);

    const result = await getCollectionsWithCounts("user-1");

    expect(result).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns [] (and logs) on other errors", async () => {
    const { chain } = makeChain({
      data: null,
      error: { code: "XXXXX", message: "boom" },
    });
    fromMock.mockReturnValue(chain);

    const result = await getCollectionsWithCounts("user-1");

    expect(result).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it("returns [] when the query yields no rows", async () => {
    const { chain } = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);

    const result = await getCollectionsWithCounts("user-1");

    expect(result).toEqual([]);
  });
});
