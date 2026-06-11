import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET, POST } from "@/app/api/collections/route";
import { PATCH, DELETE } from "@/app/api/collections/[id]/route";
import {
  POST as addRecipe,
  DELETE as removeRecipe,
} from "@/app/api/collections/[id]/recipes/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";
const COLLECTION_ID = "collection-uuid";
const RECIPE_ID = "recipe-uuid";

function setAuthenticated(id: string = USER_ID) {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id } } }),
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

function makeGetRequest(recipeId?: string) {
  const url = recipeId
    ? `http://localhost/api/collections?recipe_id=${recipeId}`
    : "http://localhost/api/collections";
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/collections", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makePatchRequest(body: object = {}) {
  return new NextRequest(`http://localhost/api/collections/${COLLECTION_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest() {
  return new NextRequest(`http://localhost/api/collections/${COLLECTION_ID}`, {
    method: "DELETE",
  });
}

function makeMembershipRequest(method: "POST" | "DELETE", body: object = {}) {
  return new NextRequest(
    `http://localhost/api/collections/${COLLECTION_ID}/recipes`,
    {
      method,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }
  );
}

function makeParams() {
  return { params: { id: COLLECTION_ID } };
}

/** GET collections: select().eq().order() */
function makeListChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  };
}

/** GET membership lookup: select().eq().in() */
function makeMembershipLookupChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue(result),
  };
}

/** POST: insert().select().single() */
function makeInsertChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

/** PATCH/DELETE: update()/delete() .eq().eq().select().single() */
function makeMutateChain(result: { data: unknown; error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

/** Ownership/recipe lookup: select().eq()[.eq()].maybeSingle() */
function makeLookupChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

/** Membership insert without select: insert() resolves directly */
function makeMembershipInsertChain(result: { error: unknown }) {
  return { insert: jest.fn().mockResolvedValue(result) };
}

/** Membership delete: delete().eq().eq() — second eq resolves */
function makeMembershipDeleteChain(result: { error: unknown }) {
  const chain = {
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn(),
  };
  chain.eq.mockReturnValueOnce(chain).mockResolvedValueOnce(result);
  return chain;
}

const collectionRow = {
  id: COLLECTION_ID,
  created_at: "2026-06-11T00:00:00Z",
  user_id: USER_ID,
  name: "Sommer",
};

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("GET /api/collections", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the user's collections with mapped recipe counts", async () => {
    setAuthenticated();
    const chain = makeListChain({
      data: [
        { ...collectionRow, collection_recipes: [{ count: 3 }] },
        { ...collectionRow, id: "c2", name: "Leer", collection_recipes: [] },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(chain);

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      { ...collectionRow, recipe_count: 3 },
      { ...collectionRow, id: "c2", name: "Leer", recipe_count: 0 },
    ]);
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("flags contains_recipe per collection when recipe_id is given", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeListChain({
        data: [
          { ...collectionRow, collection_recipes: [{ count: 3 }] },
          { ...collectionRow, id: "c2", name: "Leer", collection_recipes: [] },
        ],
        error: null,
      })
    );
    const membershipChain = makeMembershipLookupChain({
      data: [{ collection_id: COLLECTION_ID }],
      error: null,
    });
    fromMock.mockReturnValueOnce(membershipChain);

    const res = await GET(makeGetRequest(RECIPE_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      { ...collectionRow, recipe_count: 3, contains_recipe: true },
      { ...collectionRow, id: "c2", name: "Leer", recipe_count: 0, contains_recipe: false },
    ]);
    expect(membershipChain.eq).toHaveBeenCalledWith("recipe_id", RECIPE_ID);
    expect(membershipChain.in).toHaveBeenCalledWith("collection_id", [COLLECTION_ID, "c2"]);
  });

  it("skips the membership query when the user has no collections", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeListChain({ data: [], error: null }));

    const res = await GET(makeGetRequest(RECIPE_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("returns 503 with a German message when the table is missing (42P01)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeListChain({ data: null, error: { code: "42P01", message: "missing" } })
    );

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("Sammlungen sind noch nicht eingerichtet.");
  });
});

describe("POST /api/collections", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await POST(makePostRequest({ name: "Sommer" }));
    expect(res.status).toBe(401);
  });

  it.each([[{}], [{ name: "" }], [{ name: "   " }], [{ name: "x".repeat(101) }], [{ name: 5 }]])(
    "rejects an invalid name %#",
    async (body) => {
      setAuthenticated();
      const res = await POST(makePostRequest(body));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toContain("Name");
      expect(fromMock).not.toHaveBeenCalled();
    }
  );

  it("creates a collection (201) with the trimmed name and the user's id", async () => {
    setAuthenticated();
    const chain = makeInsertChain({ data: collectionRow, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await POST(makePostRequest({ name: "  Sommer  " }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe(COLLECTION_ID);
    expect(chain.insert).toHaveBeenCalledWith({ user_id: USER_ID, name: "Sommer" });
  });

  it("maps a unique violation to 409 with the duplicate message", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeInsertChain({ data: null, error: { code: "23505", message: "duplicate" } })
    );

    const res = await POST(makePostRequest({ name: "Sommer" }));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("Eine Sammlung mit diesem Namen existiert bereits.");
  });
});

describe("PATCH /api/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await PATCH(makePatchRequest({ name: "Neu" }), makeParams());
    expect(res.status).toBe(401);
  });

  it("rejects an invalid name", async () => {
    setAuthenticated();
    const res = await PATCH(makePatchRequest({ name: "" }), makeParams());
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("renames the collection scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { ...collectionRow, name: "Neu" }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await PATCH(makePatchRequest({ name: "Neu" }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Neu");
    expect(chain.update).toHaveBeenCalledWith({ name: "Neu" });
    expect(chain.eq.mock.calls).toContainEqual(["id", COLLECTION_ID]);
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });

  it("returns 404 for a foreign or missing collection", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeMutateChain({ data: null, error: { message: "no rows" } }));

    const res = await PATCH(makePatchRequest({ name: "Neu" }), makeParams());
    expect(res.status).toBe(404);
  });

  it("maps a unique violation to 409", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeMutateChain({ data: null, error: { code: "23505", message: "duplicate" } })
    );

    const res = await PATCH(makePatchRequest({ name: "Neu" }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("Eine Sammlung mit diesem Namen existiert bereits.");
  });
});

describe("DELETE /api/collections/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("deletes the collection scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { id: COLLECTION_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await DELETE(makeDeleteRequest(), makeParams());

    expect(res.status).toBe(200);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq.mock.calls).toContainEqual(["id", COLLECTION_ID]);
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });

  it("returns 404 for a foreign or missing collection", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeMutateChain({ data: null, error: { message: "no rows" } }));

    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/collections/[id]/recipes", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await addRecipe(makeMembershipRequest("POST", { recipe_id: RECIPE_ID }), makeParams());
    expect(res.status).toBe(401);
  });

  it("rejects a missing recipe_id", async () => {
    setAuthenticated();
    const res = await addRecipe(makeMembershipRequest("POST", {}), makeParams());
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the collection belongs to another user", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: null, error: null }));

    const res = await addRecipe(makeMembershipRequest("POST", { recipe_id: RECIPE_ID }), makeParams());
    expect(res.status).toBe(404);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the recipe does not exist", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: { id: COLLECTION_ID }, error: null }));
    fromMock.mockReturnValueOnce(makeLookupChain({ data: null, error: null }));

    const res = await addRecipe(makeMembershipRequest("POST", { recipe_id: RECIPE_ID }), makeParams());
    expect(res.status).toBe(404);
  });

  it("returns 403 for a recipe owned by another user", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: { id: COLLECTION_ID }, error: null }));
    fromMock.mockReturnValueOnce(
      makeLookupChain({ data: { id: RECIPE_ID, user_id: "someone-else" }, error: null })
    );

    const res = await addRecipe(makeMembershipRequest("POST", { recipe_id: RECIPE_ID }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Keine Berechtigung");
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("adds the recipe to the collection (201)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: { id: COLLECTION_ID }, error: null }));
    fromMock.mockReturnValueOnce(
      makeLookupChain({ data: { id: RECIPE_ID, user_id: USER_ID }, error: null })
    );
    const insertChain = makeMembershipInsertChain({ error: null });
    fromMock.mockReturnValueOnce(insertChain);

    const res = await addRecipe(makeMembershipRequest("POST", { recipe_id: RECIPE_ID }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual({ collection_id: COLLECTION_ID, recipe_id: RECIPE_ID });
    expect(insertChain.insert).toHaveBeenCalledWith({
      collection_id: COLLECTION_ID,
      recipe_id: RECIPE_ID,
    });
  });

  it("treats a duplicate membership as idempotent success (200)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: { id: COLLECTION_ID }, error: null }));
    fromMock.mockReturnValueOnce(
      makeLookupChain({ data: { id: RECIPE_ID, user_id: USER_ID }, error: null })
    );
    fromMock.mockReturnValueOnce(
      makeMembershipInsertChain({ error: { code: "23505", message: "duplicate" } })
    );

    const res = await addRecipe(makeMembershipRequest("POST", { recipe_id: RECIPE_ID }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data).toEqual({ collection_id: COLLECTION_ID, recipe_id: RECIPE_ID });
  });
});

describe("DELETE /api/collections/[id]/recipes", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await removeRecipe(
      makeMembershipRequest("DELETE", { recipe_id: RECIPE_ID }),
      makeParams()
    );
    expect(res.status).toBe(401);
  });

  it("rejects a missing recipe_id", async () => {
    setAuthenticated();
    const res = await removeRecipe(makeMembershipRequest("DELETE", {}), makeParams());
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the collection belongs to another user", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: null, error: null }));

    const res = await removeRecipe(
      makeMembershipRequest("DELETE", { recipe_id: RECIPE_ID }),
      makeParams()
    );
    expect(res.status).toBe(404);
  });

  it("removes the membership (200, idempotent)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeLookupChain({ data: { id: COLLECTION_ID }, error: null }));
    const deleteChain = makeMembershipDeleteChain({ error: null });
    fromMock.mockReturnValueOnce(deleteChain);

    const res = await removeRecipe(
      makeMembershipRequest("DELETE", { recipe_id: RECIPE_ID }),
      makeParams()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(deleteChain.delete).toHaveBeenCalled();
    expect(deleteChain.eq.mock.calls).toContainEqual(["collection_id", COLLECTION_ID]);
    expect(deleteChain.eq.mock.calls).toContainEqual(["recipe_id", RECIPE_ID]);
  });
});
