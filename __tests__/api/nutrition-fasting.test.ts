import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET, POST } from "@/app/api/nutrition/fasting/route";
import { PATCH, DELETE } from "@/app/api/nutrition/fasting/[id]/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";
const SESSION_ID = "session-uuid";

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

/** GET: select().eq().order().limit() */
function makeListChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
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
/** PATCH: update().eq().eq().is().select().single() */
function makePatchChain(result: { data: unknown; error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}
/** DELETE: delete().eq().eq().select().single() */
function makeDeleteChain(result: { data: unknown; error: unknown }) {
  return {
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function postRequest(body: object) {
  return new NextRequest("http://localhost/api/nutrition/fasting", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const params = { params: { id: SESSION_ID } };

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("GET /api/nutrition/fasting", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("splits the open fast from the closed history", async () => {
    setAuthenticated();
    const sessions = [
      { id: "open", started_at: "2026-06-15T08:00:00Z", ended_at: null },
      { id: "old", started_at: "2026-06-14T08:00:00Z", ended_at: "2026-06-14T22:00:00Z" },
    ];
    fromMock.mockReturnValueOnce(makeListChain({ data: sessions, error: null }));

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.active.id).toBe("open");
    expect(body.data.history).toHaveLength(1);
    expect(body.data.history[0].id).toBe("old");
  });

  it("degrades gracefully when the table is missing", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeListChain({ data: null, error: { code: "42P01" } }));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ active: null, history: [] });
  });
});

describe("POST /api/nutrition/fasting", () => {
  it.each([
    [{ preset: "nope", target_hours: 16 }, "Programm"],
    [{ preset: "16:8", target_hours: 0 }, "Fastendauer"],
    [{ preset: "16:8", target_hours: 99 }, "Fastendauer"],
  ])("rejects invalid input %#", async (body, fragment) => {
    setAuthenticated();
    const res = await POST(postRequest(body));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain(fragment);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("starts a fast (201) scoped to the user", async () => {
    setAuthenticated();
    const chain = makeInsertChain({ data: { id: "new", preset: "16:8" }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await POST(postRequest({ preset: "16:8", target_hours: 16 }));
    expect(res.status).toBe(201);
    expect(chain.insert).toHaveBeenCalledWith({ user_id: USER_ID, preset: "16:8", target_hours: 16 });
  });

  it("maps the one-open-fast unique violation to 409", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeInsertChain({ data: null, error: { code: "23505", message: "dup" } }));
    const res = await POST(postRequest({ preset: "16:8", target_hours: 16 }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/läuft bereits/);
  });
});

describe("PATCH /api/nutrition/fasting/[id]", () => {
  it("stops the open fast scoped to the owner", async () => {
    setAuthenticated();
    const chain = makePatchChain({ data: { id: SESSION_ID, ended_at: "2026-06-15T20:00:00Z" }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH" }), params);
    expect(res.status).toBe(200);
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
    expect(chain.is).toHaveBeenCalledWith("ended_at", null);
  });

  it("returns 404 when there is no matching open fast", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makePatchChain({ data: null, error: { message: "no rows" } }));
    const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH" }), params);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/nutrition/fasting/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), params);
    expect(res.status).toBe(401);
  });

  it("deletes scoped to the owner", async () => {
    setAuthenticated();
    const chain = makeDeleteChain({ data: { id: SESSION_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);
    const res = await DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(chain.eq.mock.calls).toContainEqual(["user_id", USER_ID]);
  });
});
