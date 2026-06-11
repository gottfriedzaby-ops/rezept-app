import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { POST } from "@/app/api/recipes/[id]/cooked/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const RECIPE_ID = "recipe-uuid-123";

function setAuthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }) },
  });
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  });
}

function makeRequest() {
  return new NextRequest(`http://localhost/api/recipes/${RECIPE_ID}/cooked`, {
    method: "POST",
  });
}

function makeParams() {
  return { params: { id: RECIPE_ID } };
}

/** select().eq().eq().maybeSingle() */
function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

/** update().eq().eq().select().single() */
function makeUpdateChain(result: { data: unknown; error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("POST /api/recipes/[id]/cooked", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("increments the cooked counter scoped to the owner", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSelectChain({ data: { id: RECIPE_ID, cooked_count: 2 }, error: null })
    );
    const updateChain = makeUpdateChain({
      data: { id: RECIPE_ID, cooked_count: 3, last_cooked_at: "2026-06-11T18:00:00Z" },
      error: null,
    });
    fromMock.mockReturnValueOnce(updateChain);

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.cooked_count).toBe(3);
    const updateArg = (updateChain.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.cooked_count).toBe(3);
    expect(typeof updateArg.last_cooked_at).toBe("string");
    expect((updateChain.eq as jest.Mock).mock.calls).toContainEqual(["user_id", "test-user-id"]);
  });

  it("returns 404 for foreign or missing recipes", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: null, error: null }));

    const res = await POST(makeRequest(), makeParams());
    expect(res.status).toBe(404);
  });

  it("is a silent no-op while the discovery migration is unapplied (42703)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeSelectChain({ data: null, error: { code: "42703", message: "no column" } })
    );

    const res = await POST(makeRequest(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
  });
});
