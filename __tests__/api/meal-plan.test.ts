import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET, POST } from "@/app/api/meal-plan/route";
import { PATCH, DELETE } from "@/app/api/meal-plan/[id]/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";
const ENTRY_ID = "entry-uuid";

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

function makeGetRequest(week?: string) {
  const url = week
    ? `http://localhost/api/meal-plan?week=${week}`
    : "http://localhost/api/meal-plan";
  return new NextRequest(url, { method: "GET" });
}

function makePostRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/meal-plan", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makePatchRequest(body: object = {}) {
  return new NextRequest(`http://localhost/api/meal-plan/${ENTRY_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest() {
  return new NextRequest(`http://localhost/api/meal-plan/${ENTRY_ID}`, {
    method: "DELETE",
  });
}

function makeParams() {
  return { params: { id: ENTRY_ID } };
}

/** GET: select().eq().gte().lt().order().order() */
function makeListChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn(),
  };
  // first order() chains, second resolves
  chain.order.mockReturnValueOnce(chain).mockResolvedValueOnce(result);
  return chain;
}

/** POST recipe lookup: select().eq().maybeSingle() */
function makeRecipeChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

/** POST insert: insert().select().single() */
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

const validPost = {
  date: "2026-06-08",
  meal_slot: "abend",
  recipe_id: "recipe-uuid",
};

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("GET /api/meal-plan", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the week's entries scoped to the user", async () => {
    setAuthenticated();
    const entries = [{ id: "e1", date: "2026-06-09", meal_slot: "abend" }];
    const chain = makeListChain({ data: entries, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await GET(makeGetRequest("2026-06-08"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(entries);
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(chain.gte).toHaveBeenCalledWith("date", "2026-06-08");
    expect(chain.lt).toHaveBeenCalledWith("date", "2026-06-15");
  });

  it("falls back to the current week for an invalid week param", async () => {
    setAuthenticated();
    const chain = makeListChain({ data: [], error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await GET(makeGetRequest("garbage"));

    expect(res.status).toBe(200);
    const gteArg = chain.gte.mock.calls[0][1] as string;
    expect(gteArg).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns 500 when the query fails", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeListChain({ data: null, error: { message: "kaputt" } }));

    const res = await GET(makeGetRequest("2026-06-08"));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("kaputt");
  });
});

describe("POST /api/meal-plan", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await POST(makePostRequest(validPost));
    expect(res.status).toBe(401);
  });

  it.each([
    [{ ...validPost, date: "08.06.2026" }, "Datum"],
    [{ ...validPost, meal_slot: "brunch" }, "Mahlzeit"],
    [{ ...validPost, recipe_id: "" }, "recipe_id"],
    [{ ...validPost, servings: 0 }, "Portionen"],
    [{ ...validPost, servings: 21 }, "Portionen"],
    [{ ...validPost, servings: 2.5 }, "Portionen"],
  ])("rejects invalid input %#", async (body, errorFragment) => {
    setAuthenticated();
    const res = await POST(makePostRequest(body));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain(errorFragment);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the recipe does not exist", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeRecipeChain({ data: null, error: null }));

    const res = await POST(makePostRequest(validPost));
    expect(res.status).toBe(404);
  });

  it("returns 403 for a recipe owned by another user", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeRecipeChain({ data: { id: "recipe-uuid", user_id: "someone-else" }, error: null })
    );

    const res = await POST(makePostRequest(validPost));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Keine Berechtigung");
  });

  it("creates an entry (201) with the user's id", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeRecipeChain({ data: { id: "recipe-uuid", user_id: USER_ID }, error: null })
    );
    const insertChain = makeInsertChain({
      data: { id: "new-entry", ...validPost },
      error: null,
    });
    fromMock.mockReturnValueOnce(insertChain);

    const res = await POST(makePostRequest({ ...validPost, servings: 4 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe("new-entry");
    expect(insertChain.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      recipe_id: "recipe-uuid",
      date: "2026-06-08",
      meal_slot: "abend",
      servings: 4,
    });
  });

  it("maps a unique violation to 409 with a German message", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeRecipeChain({ data: { id: "recipe-uuid", user_id: USER_ID }, error: null })
    );
    fromMock.mockReturnValueOnce(
      makeInsertChain({ data: null, error: { code: "23505", message: "duplicate" } })
    );

    const res = await POST(makePostRequest(validPost));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/bereits eingeplant/);
  });
});

describe("PATCH /api/meal-plan/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await PATCH(makePatchRequest({ servings: 2 }), makeParams());
    expect(res.status).toBe(401);
  });

  it.each([[{}], [{ servings: 0 }], [{ servings: 21 }], [{ servings: "viele" }]])(
    "rejects invalid servings payload %#",
    async (body) => {
      setAuthenticated();
      const res = await PATCH(makePatchRequest(body), makeParams());
      expect(res.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
    }
  );

  it("updates servings scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { id: ENTRY_ID, servings: 6 }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await PATCH(makePatchRequest({ servings: 6 }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.servings).toBe(6);
    expect(chain.eq.mock.calls).toContainEqual(["id", ENTRY_ID]);
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });

  it("accepts servings: null (reset to recipe default)", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { id: ENTRY_ID, servings: null }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await PATCH(makePatchRequest({ servings: null }), makeParams());
    expect(res.status).toBe(200);
  });

  it("returns 404 when the entry belongs to another user", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeMutateChain({ data: null, error: { message: "no rows" } }));

    const res = await PATCH(makePatchRequest({ servings: 2 }), makeParams());
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/meal-plan/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(401);
  });

  it("deletes the entry scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { id: ENTRY_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(200);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });

  it("returns 404 for a foreign or missing entry", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeMutateChain({ data: null, error: { message: "no rows" } }));

    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(404);
  });
});
