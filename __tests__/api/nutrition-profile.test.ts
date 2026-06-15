import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET, PUT } from "@/app/api/nutrition/profile/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-uuid";

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

/** GET: select().eq().maybeSingle() */
function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

/** PUT: upsert().select().single() */
function makeUpsertChain(result: { data: unknown; error: unknown }) {
  return {
    upsert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function putRequest(body: object) {
  return new NextRequest("http://localhost/api/nutrition/profile", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validProfile = {
  sex: "female",
  birth_date: "1996-03-15",
  height_cm: 165,
  weight_kg: 60,
  activity_level: "moderate",
  goal: "maintain",
};

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
});

describe("GET /api/nutrition/profile", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the user's profile", async () => {
    setAuthenticated();
    const chain = makeSelectChain({ data: { user_id: USER_ID, target_kcal: 2000 }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.target_kcal).toBe(2000);
    expect(chain.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("returns data:null when no profile exists yet", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: null, error: null }));

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it("degrades gracefully (data:null) when the table is missing", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeSelectChain({ data: null, error: { code: "42P01" } }));

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.error).toBeNull();
  });
});

describe("PUT /api/nutrition/profile", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await PUT(putRequest(validProfile));
    expect(res.status).toBe(401);
  });

  it.each([
    [{ ...validProfile, sex: "n/a" }, "Geschlecht"],
    [{ ...validProfile, birth_date: "15.03.1996" }, "Geburtsdatum"],
    [{ ...validProfile, height_cm: 10 }, "Größe"],
    [{ ...validProfile, weight_kg: 0 }, "Gewicht"],
    [{ ...validProfile, activity_level: "lazy" }, "Aktivitätslevel"],
    [{ ...validProfile, goal: "bulk" }, "Ziel"],
  ])("rejects invalid input %#", async (body, fragment) => {
    setAuthenticated();
    const res = await PUT(putRequest(body));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain(fragment);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("computes targets and upserts them", async () => {
    setAuthenticated();
    const chain = makeUpsertChain({ data: { user_id: USER_ID, target_kcal: 2046 }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const res = await PUT(putRequest(validProfile));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.target_kcal).toBe(2046);
    const upserted = chain.upsert.mock.calls[0][0];
    expect(upserted.user_id).toBe(USER_ID);
    expect(upserted.manual_targets).toBe(false);
    expect(upserted.target_kcal).toBeGreaterThan(0);
    expect(upserted.target_protein_g).toBeGreaterThan(0);
  });

  it("respects manually provided targets", async () => {
    setAuthenticated();
    const chain = makeUpsertChain({ data: { user_id: USER_ID }, error: null });
    fromMock.mockReturnValueOnce(chain);

    await PUT(
      putRequest({
        ...validProfile,
        manual_targets: true,
        target_kcal: 1800,
        target_protein_g: 120,
        target_carbs_g: 180,
        target_fat_g: 60,
      })
    );

    const upserted = chain.upsert.mock.calls[0][0];
    expect(upserted.manual_targets).toBe(true);
    expect(upserted.target_kcal).toBe(1800);
    expect(upserted.target_protein_g).toBe(120);
  });

  it("maps a missing table to 503", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeUpsertChain({ data: null, error: { code: "42P01" } }));

    const res = await PUT(putRequest(validProfile));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe("42P01");
  });
});
