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

beforeEach(() => {
  fromMock.mockReset();
});

describe("checkUrlDuplicate", () => {
  it("returns null when the URL is not in the database", async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await checkUrlDuplicate("https://example.com/recipe");
    expect(result).toBeNull();
  });

  it("returns duplicate info on exact URL match", async () => {
    fromMock.mockReturnValueOnce(
      makeChain({ data: { id: "abc-123", title: "Tomatensoße" }, error: null })
    );
    const result = await checkUrlDuplicate("https://example.com/recipe");
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
    const result = await checkUrlDuplicate(urlWithTracking);
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

    const result = await checkUrlDuplicate("https://example.com/recipe");
    expect(result).toBeNull();
  });

  it("skips URL normalization check for non-http sources", async () => {
    // Only one from() call expected — no hostname extraction for non-http
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    const result = await checkUrlDuplicate("manual");
    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

describe("findDuplicateRecipe", () => {
  it("returns null when no duplicates exist", async () => {
    fromMock.mockReturnValue(makeChain({ data: null, error: null }));
    const result = await findDuplicateRecipe("Neues Rezept", "manual");
    expect(result).toBeNull();
  });

  it("returns duplicate on exact source_value match", async () => {
    fromMock.mockReturnValueOnce(
      makeChain({ data: { id: "dup-id", title: "Tomatensoße" }, error: null })
    );
    const result = await findDuplicateRecipe("Tomatensoße", "https://example.com/tomaten");
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

    const result = await findDuplicateRecipe("Tomatensuppe", "manual");
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

    const result = await findDuplicateRecipe("Tomatensuppe", "manual");
    expect(result).toBeNull();
  });

  it("returns null when title words are all short (≤4 chars) — no fuzzy search triggered", async () => {
    // Exact source_value: no match, URL: skip, no title words >4 chars
    fromMock.mockReturnValueOnce(makeChain({ data: null, error: null }));
    const result = await findDuplicateRecipe("Eis", "manual");
    expect(result).toBeNull();
    // Only one from() call — the title search branch is skipped
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
