import { checkUrlDuplicate, findDuplicateRecipe } from "@/lib/duplicate-check";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase";

const fromMock = supabaseAdmin.from as jest.Mock;

/** Creates a Supabase-style query builder that resolves to `result`. */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock | ((fn: unknown, rej?: unknown) => Promise<unknown>)> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    single: jest.fn().mockResolvedValue(result),
  };
  // Make the builder thenable so `await builder` works for queries without terminal methods
  chain.then = (onFulfilled: unknown, onRejected?: unknown) =>
    Promise.resolve(result).then(
      onFulfilled as Parameters<Promise<unknown>["then"]>[0],
      onRejected as Parameters<Promise<unknown>["then"]>[1]
    );
  return chain;
}

const TEST_USER = "test-user-id";

beforeEach(() => {
  fromMock.mockReset();
});

describe("checkUrlDuplicate", () => {
  it("returns null when the URL is not in the database", async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await checkUrlDuplicate("https://example.com/recipe", TEST_USER);
    expect(result).toBeNull();
  });

  it("returns duplicate info on exact URL match", async () => {
    fromMock.mockReturnValueOnce(
      makeChain({ data: { id: "abc-123", title: "Tomatensoße" }, error: null })
    );
    const result = await checkUrlDuplicate("https://example.com/recipe", TEST_USER);
    expect(result).toEqual({ existingRecipeId: "abc-123", existingTitle: "Tomatensoße" });
  });

  it("detects duplicate via normalised URL (strips UTM params)", async () => {
    // First call (exact match): no result
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    // Second call (hostname-based search): returns a candidate
    fromMock.mockReturnValueOnce(
      makeChain({
        data: [
          { id: "xyz-789", title: "Pasta Rezept", source_value: "https://example.com/recipe" },
        ],
        error: null,
      })
    );

    const urlWithTracking = "https://example.com/recipe?utm_source=newsletter&utm_medium=email";
    const result = await checkUrlDuplicate(urlWithTracking, TEST_USER);
    expect(result).toEqual({ existingRecipeId: "xyz-789", existingTitle: "Pasta Rezept" });
  });

  it("does not detect duplicate when normalized URLs differ", async () => {
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    fromMock.mockReturnValueOnce(
      makeChain({
        data: [
          {
            id: "xyz-789",
            title: "Other Recipe",
            source_value: "https://example.com/other-recipe",
          },
        ],
        error: null,
      })
    );

    const result = await checkUrlDuplicate("https://example.com/recipe", TEST_USER);
    expect(result).toBeNull();
  });

  it("skips URL normalization check for non-http sources", async () => {
    // Only one from() call expected — no hostname extraction for non-http
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    const result = await checkUrlDuplicate("manual", TEST_USER);
    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  // DC-U-01
  it("passes userId as eq filter on the exact-match query", async () => {
    const chain = makeChain({ data: null, error: null });
    fromMock.mockReturnValue(chain);
    await checkUrlDuplicate("https://example.com/recipe", "user-abc");
    const eqCalls = (chain.eq as jest.Mock).mock.calls;
    expect(eqCalls).toContainEqual(["user_id", "user-abc"]);
  });

  // DC-U-03
  it("returns null for a user who does not own the recipe at that URL", async () => {
    // DB returns null when queried with "user-b" — simulates user isolation
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await checkUrlDuplicate("https://example.com/recipe", "user-b");
    expect(result).toBeNull();
  });

  // DC-U-04
  it("returns duplicate info for the user who owns the recipe at that URL", async () => {
    fromMock.mockReturnValueOnce(
      makeChain({ data: { id: "owned-id", title: "Mein Rezept" }, error: null })
    );
    const result = await checkUrlDuplicate("https://example.com/recipe", "user-a");
    expect(result).toEqual({ existingRecipeId: "owned-id", existingTitle: "Mein Rezept" });
  });
});

describe("findDuplicateRecipe", () => {
  it("returns null when no duplicates exist", async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await findDuplicateRecipe("Neues Rezept", "manual", TEST_USER);
    expect(result).toBeNull();
  });

  it("returns duplicate on exact source_value match", async () => {
    fromMock.mockReturnValueOnce(
      makeChain({ data: { id: "dup-id", title: "Tomatensoße" }, error: null })
    );
    const result = await findDuplicateRecipe(
      "Tomatensoße",
      "https://example.com/tomaten",
      TEST_USER
    );
    expect(result).toEqual({ existingRecipeId: "dup-id", existingTitle: "Tomatensoße" });
  });

  it("detects duplicate via fuzzy title similarity (≥85%)", async () => {
    // Exact source_value: no match
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    // URL normalisation: skip (not a URL source)
    // Title search: returns a candidate with an identical title
    fromMock.mockReturnValueOnce(
      makeChain({
        data: [{ id: "fuzzy-id", title: "Tomatensuppe" }],
        error: null,
      })
    );

    const result = await findDuplicateRecipe("Tomatensuppe", "manual", TEST_USER);
    expect(result).toEqual({ existingRecipeId: "fuzzy-id", existingTitle: "Tomatensuppe" });
  });

  it("does not flag as duplicate when title similarity is below 85%", async () => {
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null })); // exact source
    fromMock.mockReturnValueOnce(
      makeChain({
        data: [{ id: "other-id", title: "Hühnersuppe" }],
        error: null,
      })
    ); // title search returns a very different title

    const result = await findDuplicateRecipe("Tomatensuppe", "manual", TEST_USER);
    expect(result).toBeNull();
  });

  it("returns null when title words are all short (≤4 chars) — no fuzzy search triggered", async () => {
    // Exact source_value: no match, URL: skip, no title words >4 chars
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    const result = await findDuplicateRecipe("Eis", "manual", TEST_USER);
    expect(result).toBeNull();
    // Only one from() call — the title search branch is skipped
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  // DC-U-02
  it("passes userId as eq filter on every DB query", async () => {
    const exactChain = makeChain({ data: null, error: null });
    const titleChain = makeChain({
      data: [{ id: "t-id", title: "Tomatensuppe" }],
      error: null,
    });
    fromMock.mockReturnValueOnce(exactChain).mockReturnValueOnce(titleChain);

    await findDuplicateRecipe("Tomatensuppe", "manual", "user-abc");

    // Both chains must have been scoped to "user-abc"
    expect((exactChain.eq as jest.Mock).mock.calls).toContainEqual(["user_id", "user-abc"]);
    expect((titleChain.eq as jest.Mock).mock.calls).toContainEqual(["user_id", "user-abc"]);
  });
});
