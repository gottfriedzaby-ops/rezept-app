import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/collection-suggestions-server", () => ({
  getCollectionSuggestionsForUser: jest.fn(),
  fetchUserSuggestionRecipes: jest.fn(),
}));

import { GET } from "@/app/api/collections/suggestions/route";
import { POST as applyPost } from "@/app/api/collections/suggestions/apply/route";
import { POST as dismissPost } from "@/app/api/collections/suggestions/dismiss/route";
import { POST as addRecipePost } from "@/app/api/collections/suggestions/add-recipe/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCollectionSuggestionsForUser,
  fetchUserSuggestionRecipes,
} from "@/lib/collection-suggestions-server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;
const suggestionsMock = getCollectionSuggestionsForUser as jest.Mock;
const fetchRecipesMock = fetchUserSuggestionRecipes as jest.Mock;

const USER_ID = "user-uuid";
const COLLECTION_ID = "collection-uuid";
const RECIPE_ID = "recipe-uuid";

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

function jsonRequest(url: string, body: object = {}) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** insert().select().single() */
function makeInsertChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

/** insert() resolves directly (membership / dismissal) */
function makeBareInsertChain(result: { error: unknown }) {
  return { insert: jest.fn().mockResolvedValue(result) };
}

/** select().eq()…maybeSingle() */
function makeLookupChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

/** select().eq().in() */
function makeInChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue(result),
  };
}

const dessertRecipes = [
  { id: "d1", title: "Tiramisu", recipe_type: "kochen" as const, tags: ["dessert"] },
  { id: "d2", title: "Panna Cotta", recipe_type: "kochen" as const, tags: ["dessert"] },
  { id: "d3", title: "Mousse", recipe_type: "kochen" as const, tags: ["dessert"] },
];

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
  suggestionsMock.mockReset();
  fetchRecipesMock.mockReset();
});

describe("GET /api/collections/suggestions", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(suggestionsMock).not.toHaveBeenCalled();
  });

  it("returns the computed suggestions", async () => {
    setAuthenticated();
    suggestionsMock.mockResolvedValueOnce([
      { key: "desserts", matchCount: 3, recipeIds: ["d1", "d2", "d3"] },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.suggestions).toHaveLength(1);
    expect(body.data.suggestions[0].key).toBe("desserts");
    expect(suggestionsMock).toHaveBeenCalledWith(USER_ID);
  });
});

describe("POST /api/collections/suggestions/apply (canonical key)", () => {
  const url = "http://localhost/api/collections/suggestions/apply";

  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await applyPost(jsonRequest(url, { key: "desserts" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown key with 400", async () => {
    setAuthenticated();
    const res = await applyPost(jsonRequest(url, { key: "bogus" }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
    expect(fetchRecipesMock).not.toHaveBeenCalled();
  });

  it("creates the collection and bulk-adds matching recipes (201)", async () => {
    setAuthenticated();
    fetchRecipesMock.mockResolvedValueOnce(dessertRecipes);
    const insertChain = makeInsertChain({
      data: { id: COLLECTION_ID, name: "Desserts & Süßes" },
      error: null,
    });
    const membershipChain = makeBareInsertChain({ error: null });
    fromMock.mockReturnValueOnce(insertChain).mockReturnValueOnce(membershipChain);

    const res = await applyPost(jsonRequest(url, { key: "desserts", locale: "de" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.addedCount).toBe(3);
    expect(insertChain.insert).toHaveBeenCalledWith({ user_id: USER_ID, name: "Desserts & Süßes" });
    expect(membershipChain.insert).toHaveBeenCalledWith([
      { collection_id: COLLECTION_ID, recipe_id: "d1" },
      { collection_id: COLLECTION_ID, recipe_id: "d2" },
      { collection_id: COLLECTION_ID, recipe_id: "d3" },
    ]);
  });

  it("maps a duplicate name to 409", async () => {
    setAuthenticated();
    fetchRecipesMock.mockResolvedValueOnce(dessertRecipes);
    fromMock.mockReturnValueOnce(
      makeInsertChain({ data: null, error: { code: "23505", message: "dup" } })
    );
    const res = await applyPost(jsonRequest(url, { key: "desserts" }));
    expect(res.status).toBe(409);
  });

  it("maps a missing table to 503", async () => {
    setAuthenticated();
    fetchRecipesMock.mockResolvedValueOnce(dessertRecipes);
    fromMock.mockReturnValueOnce(
      makeInsertChain({ data: null, error: { code: "42P01", message: "missing" } })
    );
    const res = await applyPost(jsonRequest(url, { key: "desserts" }));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/collections/suggestions/apply (custom AI suggestion)", () => {
  const url = "http://localhost/api/collections/suggestions/apply";

  it("validates ownership of recipe_ids and creates the collection (201)", async () => {
    setAuthenticated();
    const ownedChain = makeInChain({ data: [{ id: "r1" }, { id: "r2" }], error: null });
    const insertChain = makeInsertChain({ data: { id: COLLECTION_ID, name: "Asiatisch" }, error: null });
    const membershipChain = makeBareInsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(ownedChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(membershipChain);

    const res = await applyPost(
      jsonRequest(url, { name: "Asiatisch", recipe_ids: ["r1", "r2", "not-mine"] })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.addedCount).toBe(2);
    expect(ownedChain.in).toHaveBeenCalledWith("id", ["r1", "r2", "not-mine"]);
    expect(membershipChain.insert).toHaveBeenCalledWith([
      { collection_id: COLLECTION_ID, recipe_id: "r1" },
      { collection_id: COLLECTION_ID, recipe_id: "r2" },
    ]);
  });

  it("rejects an empty recipe_ids list with 400", async () => {
    setAuthenticated();
    const res = await applyPost(jsonRequest(url, { name: "Asiatisch", recipe_ids: [] }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/collections/suggestions/dismiss", () => {
  const url = "http://localhost/api/collections/suggestions/dismiss";

  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await dismissPost(jsonRequest(url, { key: "soups" }));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown key with 400", async () => {
    setAuthenticated();
    const res = await dismissPost(jsonRequest(url, { key: "bogus" }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("records the dismissal (200)", async () => {
    setAuthenticated();
    const chain = makeBareInsertChain({ error: null });
    fromMock.mockReturnValueOnce(chain);
    const res = await dismissPost(jsonRequest(url, { key: "soups" }));
    expect(res.status).toBe(200);
    expect(chain.insert).toHaveBeenCalledWith({ user_id: USER_ID, category_key: "soups" });
  });

  it("treats a duplicate dismissal as idempotent success (200)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeBareInsertChain({ error: { code: "23505", message: "dup" } })
    );
    const res = await dismissPost(jsonRequest(url, { key: "soups" }));
    expect(res.status).toBe(200);
  });

  it("maps a missing table to 503", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeBareInsertChain({ error: { code: "42P01", message: "missing" } })
    );
    const res = await dismissPost(jsonRequest(url, { key: "soups" }));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/collections/suggestions/add-recipe", () => {
  const url = "http://localhost/api/collections/suggestions/add-recipe";

  it("rejects invalid input with 400", async () => {
    setAuthenticated();
    const res = await addRecipePost(jsonRequest(url, { key: "bogus", recipe_id: "" }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reuses an existing collection and adds the recipe (201)", async () => {
    setAuthenticated();
    const recipeChain = makeLookupChain({ data: { id: RECIPE_ID, user_id: USER_ID }, error: null });
    const collectionChain = makeLookupChain({ data: { id: COLLECTION_ID }, error: null });
    const membershipChain = makeBareInsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(recipeChain)
      .mockReturnValueOnce(collectionChain)
      .mockReturnValueOnce(membershipChain);

    const res = await addRecipePost(
      jsonRequest(url, { key: "desserts", recipe_id: RECIPE_ID, locale: "de" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual({ collection_id: COLLECTION_ID, recipe_id: RECIPE_ID });
    expect(membershipChain.insert).toHaveBeenCalledWith({
      collection_id: COLLECTION_ID,
      recipe_id: RECIPE_ID,
    });
  });

  it("returns 403 for a recipe owned by another user", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeLookupChain({ data: { id: RECIPE_ID, user_id: "someone-else" }, error: null })
    );
    const res = await addRecipePost(
      jsonRequest(url, { key: "desserts", recipe_id: RECIPE_ID })
    );
    expect(res.status).toBe(403);
  });
});
