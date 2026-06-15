import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET, POST } from "@/app/api/nutrition/log/route";
import { PATCH, DELETE } from "@/app/api/nutrition/log/[id]/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";
const ENTRY_ID = "entry-uuid";

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

/** GET entries: select().eq().eq().order().order() */
function makeEntriesChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn(),
  };
  chain.order.mockReturnValueOnce(chain).mockResolvedValueOnce(result);
  return chain;
}
/** profile / recipe lookup: select().eq().maybeSingle() */
function makeSingleChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}
/** insert().select().single() */
function makeInsertChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}
/** PATCH/DELETE: update()/delete().eq().eq().select().single() */
function makeMutateChain(result: { data: unknown; error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function getRequest(date?: string) {
  const url = date
    ? `http://localhost/api/nutrition/log?date=${date}`
    : "http://localhost/api/nutrition/log";
  return new NextRequest(url, { method: "GET" });
}
function postRequest(body: object) {
  return new NextRequest("http://localhost/api/nutrition/log", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function patchRequest(body: object) {
  return new NextRequest(`http://localhost/api/nutrition/log/${ENTRY_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const params = { params: { id: ENTRY_ID } };

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("GET /api/nutrition/log", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET(getRequest("2026-06-15"));
    expect(res.status).toBe(401);
  });

  it("sums totals and computes remaining against the target", async () => {
    setAuthenticated();
    const entries = [
      { id: "e1", meal_slot: "mittag", kcal_per_serving: 100, protein_g: 10, carbs_g: 20, fat_g: 5, servings: 2 },
      { id: "e2", meal_slot: "abend", kcal_per_serving: 300, protein_g: 5, carbs_g: 40, fat_g: 10, servings: 1 },
    ];
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: entries, error: null }));
    fromMock.mockReturnValueOnce(
      makeSingleChain({
        data: { target_kcal: 2000, target_protein_g: 100, target_carbs_g: 250, target_fat_g: 70 },
        error: null,
      })
    );

    const res = await GET(getRequest("2026-06-15"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.totals.kcal).toBe(500); // 100*2 + 300*1
    expect(body.data.totals.protein_g).toBe(25); // 10*2 + 5
    expect(body.data.remaining.kcal).toBe(1500);
    expect(body.data.target.kcal).toBe(2000);
  });

  it("returns null target when no profile is set", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: [], error: null }));
    fromMock.mockReturnValueOnce(makeSingleChain({ data: null, error: null }));

    const res = await GET(getRequest("2026-06-15"));
    const body = await res.json();
    expect(body.data.target).toBeNull();
    expect(body.data.remaining).toBeNull();
    expect(body.data.totals.kcal).toBe(0);
  });

  it("degrades gracefully when the diary table is missing", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeEntriesChain({ data: null, error: { code: "42P01" } }));
    fromMock.mockReturnValueOnce(makeSingleChain({ data: null, error: { code: "42P01" } }));

    const res = await GET(getRequest("2026-06-15"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.entries).toEqual([]);
  });
});

describe("POST /api/nutrition/log", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await POST(postRequest({ date: "2026-06-15", meal_slot: "mittag", source: "manual", label: "Apfel", kcal_per_serving: 95 }));
    expect(res.status).toBe(401);
  });

  it.each([
    [{ date: "bad", meal_slot: "mittag", source: "manual", label: "x", kcal_per_serving: 1 }, "Datum"],
    [{ date: "2026-06-15", meal_slot: "brunch", source: "manual", label: "x", kcal_per_serving: 1 }, "Mahlzeit"],
    [{ date: "2026-06-15", meal_slot: "mittag", source: "manual", label: "x", kcal_per_serving: 1, servings: 0 }, "Menge"],
  ])("rejects invalid input %#", async (body, fragment) => {
    setAuthenticated();
    const res = await POST(postRequest(body));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain(fragment);
  });

  it("logs a manual entry (201)", async () => {
    setAuthenticated();
    const chain = makeInsertChain({ data: { id: "new", label: "Apfel" }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await POST(
      postRequest({ date: "2026-06-15", meal_slot: "snacks", source: "manual", label: "Apfel", kcal_per_serving: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3 })
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.id).toBe("new");
    const inserted = chain.insert.mock.calls[0][0];
    expect(inserted.user_id).toBe(USER_ID);
    expect(inserted.source).toBe("manual");
    expect(inserted.kcal_per_serving).toBe(95);
  });

  it("snapshots recipe nutrition when logging a recipe", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSingleChain({
        data: { id: "r1", user_id: USER_ID, title: "Suppe", kcal_per_serving: 250, protein_g: 8, carbs_g: 30, fat_g: 9 },
        error: null,
      })
    );
    const insert = makeInsertChain({ data: { id: "new" }, error: null });
    fromMock.mockReturnValueOnce(insert);

    const res = await POST(postRequest({ date: "2026-06-15", meal_slot: "mittag", source: "recipe", recipe_id: "r1", servings: 2 }));
    expect(res.status).toBe(201);
    const inserted = insert.insert.mock.calls[0][0];
    expect(inserted.label).toBe("Suppe");
    expect(inserted.kcal_per_serving).toBe(250);
    expect(inserted.servings).toBe(2);
    expect(inserted.recipe_id).toBe("r1");
  });

  it("returns 403 for a recipe owned by someone else", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSingleChain({ data: { id: "r1", user_id: "other", title: "X", kcal_per_serving: 100 }, error: null })
    );
    const res = await POST(postRequest({ date: "2026-06-15", meal_slot: "mittag", source: "recipe", recipe_id: "r1" }));
    expect(res.status).toBe(403);
  });

  it("returns 422 when the recipe has no nutrition", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSingleChain({ data: { id: "r1", user_id: USER_ID, title: "X", kcal_per_serving: null }, error: null })
    );
    const res = await POST(postRequest({ date: "2026-06-15", meal_slot: "mittag", source: "recipe", recipe_id: "r1" }));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("NUTRITION_MISSING");
  });
});

describe("PATCH /api/nutrition/log/[id]", () => {
  it("updates servings scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { id: ENTRY_ID, servings: 3 }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await PATCH(patchRequest({ servings: 3 }), params);
    expect(res.status).toBe(200);
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });

  it("rejects an empty update", async () => {
    setAuthenticated();
    const res = await PATCH(patchRequest({}), params);
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign entry", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeMutateChain({ data: null, error: { message: "no rows" } }));
    const res = await PATCH(patchRequest({ servings: 2 }), params);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/nutrition/log/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await DELETE(
      new NextRequest(`http://localhost/api/nutrition/log/${ENTRY_ID}`, { method: "DELETE" }),
      params
    );
    expect(res.status).toBe(401);
  });

  it("deletes scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeMutateChain({ data: { id: ENTRY_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);
    const res = await DELETE(
      new NextRequest(`http://localhost/api/nutrition/log/${ENTRY_ID}`, { method: "DELETE" }),
      params
    );
    expect(res.status).toBe(200);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });
});
