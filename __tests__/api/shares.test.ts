import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/shares/route";
import { DELETE } from "@/app/api/shares/[id]/route";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  }),
}));

import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const SHARE_ID = "share-uuid-123";

function makeGetRequest() {
  return new NextRequest("http://localhost/api/shares", { method: "GET" });
}

function makePostRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/shares", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest() {
  return new NextRequest(`http://localhost/api/shares/${SHARE_ID}`, { method: "DELETE" });
}

function makeDeleteParams() {
  return { params: { id: SHARE_ID } };
}

/** GET /api/shares: select().eq().order() */
function makeListChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  };
}

/** POST /api/shares: insert().select().single() */
function makeInsertChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

/** DELETE /api/shares/[id]: update().eq().eq().select().single() */
function makeUpdateChain(result: { data: unknown; error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  });
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
  serverClientMock.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/shares
// ---------------------------------------------------------------------------

describe("GET /api/shares", () => {
  // SH-01
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.data).toBeNull();
    expect(body.error).toBe("Nicht angemeldet");
  });

  // SH-02
  it("returns 200 with the user's shares ordered newest-first", async () => {
    const shares = [
      { id: "s1", created_at: "2026-03-01", token: "tok1", label: "Home", revoked_at: null },
      { id: "s2", created_at: "2026-01-01", token: "tok2", label: null, revoked_at: null },
    ];
    fromMock.mockReturnValueOnce(makeListChain({ data: shares, error: null }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(shares);
    expect(body.error).toBeNull();
  });

  // SH-02 ownership: eq("owner_id") must be called with the authenticated user's id
  it("scopes the query to the authenticated user", async () => {
    const chain = makeListChain({ data: [], error: null });
    fromMock.mockReturnValueOnce(chain);

    await GET();

    expect((chain.eq as jest.Mock).mock.calls).toContainEqual(["owner_id", "test-user-id"]);
  });

  // SH-03
  it("throws when the database returns an error", async () => {
    fromMock.mockReturnValueOnce(makeListChain({ data: null, error: new Error("DB error") }));
    await expect(GET()).rejects.toThrow("DB error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/shares
// ---------------------------------------------------------------------------

describe("POST /api/shares", () => {
  // SH-04
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await POST(makePostRequest());
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.data).toBeNull();
  });

  // SH-05
  it("returns 201 with the created share including a non-empty token and label", async () => {
    const savedShare = {
      id: SHARE_ID,
      created_at: "2026-05-12T10:00:00Z",
      token: "generated-token",
      label: "Meine Sammlung",
      revoked_at: null,
    };
    fromMock.mockReturnValueOnce(makeInsertChain({ data: savedShare, error: null }));

    const res = await POST(makePostRequest({ label: "Meine Sammlung" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.token).toBeTruthy();
    expect(body.data.label).toBe("Meine Sammlung");
    expect(body.error).toBeNull();
  });

  // SH-06
  it("creates a share with null label when no label is provided", async () => {
    const savedShare = {
      id: SHARE_ID,
      created_at: "2026-05-12T10:00:00Z",
      token: "generated-token",
      label: null,
      revoked_at: null,
    };
    fromMock.mockReturnValueOnce(makeInsertChain({ data: savedShare, error: null }));

    const res = await POST(makePostRequest());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.label).toBeNull();
  });

  // SH-05 ownership: insert must include owner_id
  it("inserts owner_id from the authenticated user", async () => {
    const chain = makeInsertChain({ data: { id: SHARE_ID, token: "t", label: null, revoked_at: null }, error: null });
    fromMock.mockReturnValueOnce(chain);

    await POST(makePostRequest({ label: "Test" }));

    const insertCall = (chain.insert as jest.Mock).mock.calls[0][0];
    expect(insertCall.owner_id).toBe("test-user-id");
  });

  // SH-05 token: must be a non-empty string (crypto-generated)
  it("generates a non-empty token for every new share", async () => {
    const chain = makeInsertChain({ data: { id: SHARE_ID, token: "real-token", label: null, revoked_at: null }, error: null });
    fromMock.mockReturnValueOnce(chain);

    await POST(makePostRequest());

    const insertCall = (chain.insert as jest.Mock).mock.calls[0][0];
    expect(typeof insertCall.token).toBe("string");
    expect(insertCall.token.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/shares/[id]
// ---------------------------------------------------------------------------

describe("DELETE /api/shares/[id]", () => {
  // SH-07
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await DELETE(makeDeleteRequest(), makeDeleteParams());
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.data).toBeNull();
  });

  // SH-08
  it("returns 200 and sets revoked_at on the share", async () => {
    const chain = makeUpdateChain({ data: { id: SHARE_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await DELETE(makeDeleteRequest(), makeDeleteParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();

    const updateCall = (chain.update as jest.Mock).mock.calls[0][0];
    expect(updateCall).toHaveProperty("revoked_at");
    expect(typeof updateCall.revoked_at).toBe("string");
  });

  // SH-08 ownership: must filter by both id and owner_id so users can't revoke others' shares
  it("scopes the update to the share id and the authenticated user", async () => {
    const chain = makeUpdateChain({ data: { id: SHARE_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);

    await DELETE(makeDeleteRequest(), makeDeleteParams());

    const eqCalls = (chain.eq as jest.Mock).mock.calls;
    expect(eqCalls).toContainEqual(["id", SHARE_ID]);
    expect(eqCalls).toContainEqual(["owner_id", "test-user-id"]);
  });

  // SH-09
  it("returns 404 when the share is not found or belongs to another user", async () => {
    fromMock.mockReturnValueOnce(
      makeUpdateChain({ data: null, error: { message: "No rows" } })
    );

    const res = await DELETE(makeDeleteRequest(), makeDeleteParams());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Nicht gefunden");
  });
});
