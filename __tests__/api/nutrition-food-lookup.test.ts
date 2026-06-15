import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/claude", () => ({
  lookupFoodNutrition: jest.fn(),
}));

jest.mock("@/lib/food-database-store", () => ({
  getFoodByName: jest.fn(),
  saveFood: jest.fn(),
}));

jest.mock("@/lib/food-lookup-rate-limit", () => ({
  checkDailyFoodLookupLimit: jest.fn(),
  foodLookupRateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

import { POST } from "@/app/api/nutrition/food-lookup/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupFoodNutrition } from "@/lib/claude";
import { getFoodByName, saveFood } from "@/lib/food-database-store";
import { checkDailyFoodLookupLimit } from "@/lib/food-lookup-rate-limit";

const createServerMock = createSupabaseServerClient as jest.Mock;
const lookupMock = lookupFoodNutrition as jest.Mock;
const getFoodMock = getFoodByName as jest.Mock;
const saveFoodMock = saveFood as jest.Mock;
const limitMock = checkDailyFoodLookupLimit as jest.Mock;

function makeRequest(name: unknown) {
  return new NextRequest("http://localhost/api/nutrition/food-lookup", {
    method: "POST",
    body: JSON.stringify({ name }),
    headers: { "content-type": "application/json" },
  });
}

function setUser(id: string | null = "u1") {
  createServerMock.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: id ? { id } : null } }) },
  });
}

beforeEach(() => {
  createServerMock.mockReset();
  lookupMock.mockReset();
  getFoodMock.mockReset();
  saveFoodMock.mockReset();
  limitMock.mockReset();
  setUser("u1");
});

describe("POST /api/nutrition/food-lookup", () => {
  it("returns 401 when not authenticated", async () => {
    setUser(null);
    const res = await POST(makeRequest("Apfel"));
    expect(res.status).toBe(401);
    expect(getFoodMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty / whitespace name without DB or Claude", async () => {
    const res = await POST(makeRequest("   "));
    expect(res.status).toBe(400);
    expect(getFoodMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an over-long name", async () => {
    const res = await POST(makeRequest("x".repeat(201)));
    expect(res.status).toBe(400);
    expect(getFoodMock).not.toHaveBeenCalled();
  });

  it("returns a cache hit (origin 'db') without calling Claude or the rate limiter", async () => {
    getFoodMock.mockResolvedValueOnce({
      name: "apfel",
      display_name: "Apfel",
      kcal_per_serving: 95,
      protein_g: 0,
      carbs_g: 25,
      fat_g: 0,
      serving_desc: "1 mittelgroßer Apfel (ca. 180 g)",
      source: "seed",
    });

    const res = await POST(makeRequest("Apfel"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      display_name: "Apfel",
      kcal_per_serving: 95,
      protein_g: 0,
      carbs_g: 25,
      fat_g: 0,
      serving_desc: "1 mittelgroßer Apfel (ca. 180 g)",
      origin: "db",
    });
    expect(getFoodMock).toHaveBeenCalledWith("apfel");
    expect(limitMock).not.toHaveBeenCalled();
    expect(lookupMock).not.toHaveBeenCalled();
    expect(saveFoodMock).not.toHaveBeenCalled();
  });

  it("on a miss, asks Claude, persists the result (source 'llm') and returns origin 'estimate'", async () => {
    getFoodMock.mockResolvedValueOnce(null);
    limitMock.mockResolvedValueOnce({ userId: "u1", allowed: true, count: 0, remaining: 30 });
    lookupMock.mockResolvedValueOnce({
      display_name: "Falafel-Wrap",
      serving_desc: "1 Wrap (ca. 250 g)",
      kcal_per_serving: 450,
      protein_g: 15,
      carbs_g: 50,
      fat_g: 20,
    });

    const res = await POST(makeRequest("Falafel-Wrap"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.origin).toBe("estimate");
    expect(body.data.kcal_per_serving).toBe(450);
    expect(lookupMock).toHaveBeenCalledWith("Falafel-Wrap", "u1");
    expect(saveFoodMock).toHaveBeenCalledTimes(1);
    expect(saveFoodMock.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: "falafel-wrap", source: "llm", kcal_per_serving: 450 })
    );
  });

  it("returns 429 on a miss once the daily limit is reached (Claude not called)", async () => {
    getFoodMock.mockResolvedValueOnce(null);
    limitMock.mockResolvedValueOnce({ userId: "u1", allowed: false, count: 30, remaining: 0 });

    const res = await POST(makeRequest("Falafel-Wrap"));
    expect(res.status).toBe(429);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(saveFoodMock).not.toHaveBeenCalled();
  });

  it("returns 422 LOOKUP_FAILED when Claude finds no calories, persisting nothing", async () => {
    getFoodMock.mockResolvedValueOnce(null);
    limitMock.mockResolvedValueOnce({ userId: "u1", allowed: true, count: 0, remaining: 30 });
    lookupMock.mockResolvedValueOnce({
      display_name: null,
      serving_desc: null,
      kcal_per_serving: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    });

    const res = await POST(makeRequest("asdfqwer"));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("LOOKUP_FAILED");
    expect(saveFoodMock).not.toHaveBeenCalled();
  });

  it("degrades to the Claude path when the table is missing (getFoodByName returns null)", async () => {
    // The store swallows 42P01 internally and returns null → looks like a miss.
    getFoodMock.mockResolvedValueOnce(null);
    limitMock.mockResolvedValueOnce({ userId: "u1", allowed: true, count: 0, remaining: 30 });
    lookupMock.mockResolvedValueOnce({
      display_name: "Quinoa",
      serving_desc: "1 Portion (ca. 100 g)",
      kcal_per_serving: 120,
      protein_g: 4,
      carbs_g: 21,
      fat_g: 2,
    });

    const res = await POST(makeRequest("Quinoa"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.origin).toBe("estimate");
    expect(lookupMock).toHaveBeenCalled();
  });
});
