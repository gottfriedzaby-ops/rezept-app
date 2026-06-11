import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { POST } from "@/app/api/shopping-list/sync/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-1";
const ITEM_ID = "11111111-2222-3333-4444-555555555555";

function setAuthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
  });
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  });
}

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/shopping-list/sync", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    recipe_id: "recipe-1",
    recipe_title: "Tomatensoße",
    ingredient_name: "Tomaten",
    amount: 300,
    unit: "g",
    checked: false,
    manual: false,
    added_at: "2026-06-11T10:00:00.000Z",
    updated_at: "2026-06-11T10:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

/** select("id, updated_at").eq() — thenable */
function makeSelectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn(),
  };
  chain.eq = jest.fn().mockResolvedValue(result);
  return chain;
}

/** upsert() */
function makeUpsertChain(result: { error: unknown }) {
  return { upsert: jest.fn().mockResolvedValue(result) };
}

/** delete().eq().not().lt() */
function makeDeleteChain() {
  return {
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    lt: jest.fn().mockResolvedValue({ error: null }),
  };
}

/** final select().eq().order() */
function makeMergedChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/shopping-list/sync", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await POST(makeRequest({ items: [] }));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 503 while the table is missing (migration unapplied)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSelectChain({ data: null, error: { code: "42P01", message: "missing" } })
    );

    const res = await POST(makeRequest({ items: [makeItem()] }));
    expect(res.status).toBe(503);
  });

  it("upserts new client items scoped to the user and returns the merged list", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: [], error: null }));
    const upsertChain = makeUpsertChain({ error: null });
    fromMock.mockReturnValueOnce(upsertChain);
    fromMock.mockReturnValueOnce(makeDeleteChain());
    const mergedRows = [makeItem()];
    fromMock.mockReturnValueOnce(makeMergedChain({ data: mergedRows, error: null }));

    const res = await POST(makeRequest({ items: [makeItem()] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toHaveLength(1);

    const upserted = (upsertChain.upsert as jest.Mock).mock.calls[0][0];
    expect(upserted[0].user_id).toBe(USER_ID);
    expect(upserted[0].id).toBe(ITEM_ID);
    expect((upsertChain.upsert as jest.Mock).mock.calls[0][1]).toEqual({
      onConflict: "user_id,id",
    });
  });

  it("skips client items that are older than the server copy (LWW)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSelectChain({
        data: [{ id: ITEM_ID, updated_at: "2026-06-11T12:00:00.000Z" }],
        error: null,
      })
    );
    // No upsert call expected — straight to purge + merged select
    fromMock.mockReturnValueOnce(makeDeleteChain());
    fromMock.mockReturnValueOnce(makeMergedChain({ data: [], error: null }));

    const res = await POST(
      makeRequest({ items: [makeItem({ updated_at: "2026-06-11T10:00:00.000Z" })] })
    );

    expect(res.status).toBe(200);
    // from() called 3 times: select, delete (purge), merged select — no upsert
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  it("ignores malformed items (bad uuid, missing name, junk types)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: [], error: null }));
    fromMock.mockReturnValueOnce(makeDeleteChain());
    fromMock.mockReturnValueOnce(makeMergedChain({ data: [], error: null }));

    const res = await POST(
      makeRequest({
        items: [
          makeItem({ id: "not-a-uuid" }),
          makeItem({ ingredient_name: "" }),
          makeItem({ added_at: "gestern" }),
          "garbage",
        ],
      })
    );

    expect(res.status).toBe(200);
    // All items invalid → no upsert chain requested
    expect(fromMock).toHaveBeenCalledTimes(3);
  });
});
