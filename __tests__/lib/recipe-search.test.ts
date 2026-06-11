jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase";
import {
  searchRecipes,
  getVisibleTags,
  getSharedOwnerIds,
  parseSort,
  DEFAULT_PAGE_SIZE,
} from "@/lib/recipe-search";

const fromMock = supabaseAdmin.from as jest.Mock;

const USER = "user-1";

interface ChainCalls {
  select: unknown[][];
  eq: unknown[][];
  or: unknown[][];
  ilike: unknown[][];
  contains: unknown[][];
  order: unknown[][];
  range: unknown[][];
}

/** Records every builder call and resolves with the given result. */
function makeChain(result: { data: unknown; error: unknown; count?: number | null }) {
  const calls: ChainCalls = {
    select: [], eq: [], or: [], ilike: [], contains: [], order: [], range: [],
  };
  const chain: Record<string, unknown> = {};
  (Object.keys(calls) as Array<keyof ChainCalls>).forEach((method) => {
    chain[method] = jest.fn((...args: unknown[]) => {
      calls[method].push(args);
      return chain;
    });
  });
  chain.returns = jest.fn().mockResolvedValue({
    data: result.data,
    error: result.error,
    count: result.count ?? null,
  });
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: result.data, error: result.error });
  // thenable so `await query` works for getVisibleTags
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve({ data: result.data, error: result.error }).then(onF, onR);
  return { chain, calls };
}

beforeEach(() => {
  fromMock.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("parseSort", () => {
  it("accepts az/time and falls back to newest", () => {
    expect(parseSort("az")).toBe("az");
    expect(parseSort("time")).toBe("time");
    expect(parseSort("evil")).toBe("newest");
    expect(parseSort(null)).toBe("newest");
  });
});

describe("searchRecipes", () => {
  it("scopes to the user's own recipes with default pagination", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, [], {});

    expect(calls.eq).toContainEqual(["user_id", USER]);
    expect(calls.range).toContainEqual([0, DEFAULT_PAGE_SIZE - 1]);
    expect(calls.order).toContainEqual(["created_at", { ascending: false }]);
    expect(calls.or).toHaveLength(0);
  });

  it("includes non-private recipes of shared owners via OR", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, ["owner-a", "owner-b"], {});

    expect(calls.or[0][0]).toBe(
      "user_id.eq.user-1,and(user_id.in.(owner-a,owner-b),is_private.eq.false)"
    );
  });

  it("restricts the favorites filter to own recipes", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, ["owner-a"], { favoritesOnly: true });

    expect(calls.eq).toContainEqual(["user_id", USER]);
    expect(calls.eq).toContainEqual(["favorite", true]);
    expect(calls.or).toHaveLength(0);
  });

  it("searches search_text with an escaped, lowercased substring pattern", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, [], { q: "  100% Käse_Sahne  " });

    expect(calls.ilike).toContainEqual(["search_text", "%100\\% käse\\_sahne%"]);
  });

  it("applies AND tag filtering via contains", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, [], { tags: ["pasta", "vegetarisch"] });

    expect(calls.contains).toContainEqual(["tags", ["pasta", "vegetarisch"]]);
  });

  it("sorts by total_time (then created_at) for sort=time", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, [], { sort: "time" });

    expect(calls.order[0]).toEqual(["total_time", { ascending: true }]);
    expect(calls.order[1]).toEqual(["created_at", { ascending: false }]);
  });

  it("clamps limit and offset", async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    fromMock.mockReturnValue(chain);

    await searchRecipes(USER, [], { limit: 999, offset: -5 });

    expect(calls.range).toContainEqual([0, 59]); // max page size 60
  });

  it("falls back to a title-only search when search_text is missing (42703)", async () => {
    const failing = makeChain({
      data: null,
      error: { code: "42703", message: 'column "search_text" does not exist' },
    });
    const succeeding = makeChain({
      data: [{ id: "r1" }],
      error: null,
      count: 1,
    });
    fromMock.mockReturnValueOnce(failing.chain).mockReturnValueOnce(succeeding.chain);

    const result = await searchRecipes(USER, [], { q: "kuchen", sort: "time" });

    expect(result.total).toBe(1);
    expect(succeeding.calls.ilike).toContainEqual(["title", "%kuchen%"]);
    // degraded time sort falls back to created_at
    expect(succeeding.calls.order[0]).toEqual(["created_at", { ascending: false }]);
  });

  it("throws on other database errors", async () => {
    const { chain } = makeChain({ data: null, error: { code: "XX000", message: "kaputt" } });
    fromMock.mockReturnValue(chain);

    await expect(searchRecipes(USER, [], {})).rejects.toThrow("kaputt");
  });
});

describe("getVisibleTags", () => {
  it("ranks tags by frequency with German alphabetical tiebreaker", async () => {
    const { chain } = makeChain({
      data: [
        { tags: ["pasta", "vegetarisch"] },
        { tags: ["pasta"] },
        { tags: ["äpfel"] },
        { tags: ["zucchini"] },
      ],
      error: null,
    });
    fromMock.mockReturnValue(chain);

    const tags = await getVisibleTags(USER, []);

    expect(tags[0]).toBe("pasta"); // count 2
    expect(tags.slice(1)).toEqual(["äpfel", "vegetarisch", "zucchini"]); // de order
  });
});

describe("getSharedOwnerIds", () => {
  it("returns owner ids when the unified view is enabled", async () => {
    const sharesChain = makeChain({
      data: [{ owner_id: "o1" }, { owner_id: "o2" }],
      error: null,
    });
    const settingsChain = makeChain({
      data: { show_shared_in_main_library: true },
      error: null,
    });
    fromMock.mockReturnValueOnce(sharesChain.chain).mockReturnValueOnce(settingsChain.chain);

    expect(await getSharedOwnerIds(USER)).toEqual(["o1", "o2"]);
  });

  it("returns an empty list when the user disabled the unified view", async () => {
    const sharesChain = makeChain({ data: [{ owner_id: "o1" }], error: null });
    const settingsChain = makeChain({
      data: { show_shared_in_main_library: false },
      error: null,
    });
    fromMock.mockReturnValueOnce(sharesChain.chain).mockReturnValueOnce(settingsChain.chain);

    expect(await getSharedOwnerIds(USER)).toEqual([]);
  });
});
