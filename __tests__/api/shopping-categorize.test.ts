import { NextRequest } from "next/server";
import { POST } from "@/app/api/shopping/categorize/route";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/claude", () => ({
  categorizeIngredients: jest.fn(),
}));

import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { categorizeIngredients } from "@/lib/claude";

const fromMock = supabaseAdmin.from as jest.Mock;
const createServerMock = createSupabaseServerClient as jest.Mock;
const categorizeMock = categorizeIngredients as jest.Mock;

function makeRequest(names: unknown) {
  return new NextRequest("http://localhost/api/shopping/categorize", {
    method: "POST",
    body: JSON.stringify({ names }),
    headers: { "content-type": "application/json" },
  });
}

/** from(TABLE) → { select().in() → selectResult ; upsert() → upsertResult } */
function setChain(
  selectResult: { data: unknown; error: unknown },
  upsertResult: { error: unknown } = { error: null }
) {
  const chain = {
    select: jest.fn().mockReturnValue({ in: jest.fn().mockResolvedValue(selectResult) }),
    upsert: jest.fn().mockResolvedValue(upsertResult),
  };
  fromMock.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  fromMock.mockReset();
  categorizeMock.mockReset();
  createServerMock.mockReset();
  createServerMock.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user" } } }) },
  });
});

describe("POST /api/shopping/categorize", () => {
  it("returns 401 when not authenticated", async () => {
    createServerMock.mockResolvedValueOnce({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const res = await POST(makeRequest(["Quinoa"]));
    expect(res.status).toBe(401);
    expect(categorizeMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns {} for an empty name list without touching the DB or Claude", async () => {
    const res = await POST(makeRequest([]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
    expect(categorizeMock).not.toHaveBeenCalled();
  });

  it("resolves statically-known names without the shared table or Claude", async () => {
    const res = await POST(makeRequest(["Tomaten"]));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ Tomaten: "obst-gemuese" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(categorizeMock).not.toHaveBeenCalled();
  });

  it("uses a shared-table hit and does NOT call Claude", async () => {
    const chain = setChain({ data: [{ name: "quinoa", category: "vorrat" }], error: null });

    const res = await POST(makeRequest(["Quinoa"]));
    const body = await res.json();

    expect(body.data).toEqual({ Quinoa: "vorrat" });
    expect(categorizeMock).not.toHaveBeenCalled();
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it("asks Claude for system-new names and persists them to the shared table", async () => {
    const chain = setChain({ data: [], error: null });
    categorizeMock.mockResolvedValueOnce({ Zzzfood: "sonstiges" });

    const res = await POST(makeRequest(["Zzzfood"]));
    const body = await res.json();

    expect(body.data).toEqual({ Zzzfood: "sonstiges" });
    expect(categorizeMock).toHaveBeenCalledWith(["Zzzfood"], "test-user");
    expect(chain.upsert).toHaveBeenCalledTimes(1);
    expect(chain.upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({ name: "zzzfood", category: "sonstiges" }),
    ]);
  });

  it("degrades gracefully to Claude when the shared table read errors", async () => {
    setChain({ data: null, error: { message: 'relation "ingredient_categories" does not exist' } });
    categorizeMock.mockResolvedValueOnce({ Zzzfood: "vorrat" });

    const res = await POST(makeRequest(["Zzzfood"]));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ Zzzfood: "vorrat" });
    expect(categorizeMock).toHaveBeenCalled();
  });
});
