import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: jest.fn(),
  },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET, PATCH } from "@/app/api/settings/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";

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

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/settings", () => {
  it("returns existing settings row without inserting", async () => {
    setAuthenticated();
    const existing = {
      user_id: USER_ID,
      show_shared_in_main_library: false,
    };
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const insertChain = {
      insert: jest.fn(),
    };
    fromMock
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: existing, error: null });
    expect(insertChain.insert).not.toHaveBeenCalled();
  });

  it("inserts default row on first call and returns it", async () => {
    setAuthenticated();
    const created = {
      user_id: USER_ID,
      show_shared_in_main_library: true,
    };
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: created, error: null }),
    };
    fromMock
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: created, error: null });
    expect(insertChain.insert).toHaveBeenCalledWith({
      user_id: USER_ID,
      show_shared_in_main_library: true,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("recovers from a concurrent-insert race (23505) by re-selecting", async () => {
    setAuthenticated();
    const raced = {
      user_id: USER_ID,
      show_shared_in_main_library: true,
    };
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
    const insertChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      }),
    };
    const reSelectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: raced, error: null }),
    };
    fromMock
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(reSelectChain);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: raced, error: null });
  });

  it("returns 500 + logs when the select fails", async () => {
    setAuthenticated();
    const selectChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: null, error: { message: "db down" } }),
    };
    fromMock.mockReturnValueOnce(selectChain);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("db down");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("PATCH /api/settings", () => {
  function makePatchRequest(body: object) {
    return new NextRequest("http://localhost/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("upserts the toggle and returns the new row", async () => {
    setAuthenticated();
    const updated = {
      user_id: USER_ID,
      show_shared_in_main_library: false,
    };
    const upsertChain = {
      upsert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: updated, error: null }),
    };
    fromMock.mockReturnValueOnce(upsertChain);

    const res = await PATCH(
      makePatchRequest({ show_shared_in_main_library: false })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(updated);
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      { user_id: USER_ID, show_shared_in_main_library: false },
      { onConflict: "user_id" }
    );
  });

  it("rejects when no recognised fields are provided", async () => {
    setAuthenticated();
    const res = await PATCH(makePatchRequest({ unrelated: 1 }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await PATCH(makePatchRequest({ show_shared_in_main_library: true }));
    expect(res.status).toBe(401);
  });
});
