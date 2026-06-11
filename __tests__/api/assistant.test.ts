import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/assistant-rate-limit", () => {
  const actual = jest.requireActual("@/lib/assistant-rate-limit");
  return { ...actual, checkDailyAssistantLimit: jest.fn() };
});

jest.mock("@/lib/assistant", () => {
  const actual = jest.requireActual("@/lib/assistant");
  return {
    ...actual,
    suggestRecipesFromPantry: jest.fn(),
    suggestWeekPlan: jest.fn(),
    answerCookingQuestion: jest.fn(),
  };
});

import { POST as suggestPOST } from "@/app/api/assistant/suggest/route";
import { POST as weekPlanPOST } from "@/app/api/assistant/week-plan/route";
import { POST as questionPOST } from "@/app/api/assistant/cooking-question/route";
import { supabaseAdmin } from "@/lib/supabase";
import { checkDailyAssistantLimit, DAILY_ASSISTANT_LIMIT } from "@/lib/assistant-rate-limit";
import {
  suggestRecipesFromPantry,
  suggestWeekPlan,
  answerCookingQuestion,
} from "@/lib/assistant";

const fromMock = supabaseAdmin.from as jest.Mock;
const limitMock = checkDailyAssistantLimit as jest.Mock;
const pantryMock = suggestRecipesFromPantry as jest.Mock;
const weekMock = suggestWeekPlan as jest.Mock;
const answerMock = answerCookingQuestion as jest.Mock;

function setLimit(opts: Partial<{ userId: string | null; allowed: boolean; count: number }> = {}) {
  limitMock.mockResolvedValueOnce({
    userId: opts.userId === undefined ? "user-1" : opts.userId,
    allowed: opts.allowed ?? true,
    count: opts.count ?? 0,
    remaining: DAILY_ASSISTANT_LIMIT - (opts.count ?? 0),
  });
}

function makeRequest(url: string, body: object) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** select().eq().order().limit().returns() — thenable list chain */
function makeListChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    returns: jest.fn().mockResolvedValue(result),
  };
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onF, onR);
  return chain;
}

const RECIPE_ROW = {
  id: "r1",
  title: "Tomatensoße",
  tags: ["pasta"],
  recipe_type: "kochen",
  prep_time: 10,
  cook_time: 20,
  servings: 4,
  image_url: null,
  ingredients: [{ amount: 200, unit: "g", name: "Tomaten" }],
  sections: null,
  last_cooked_at: null,
};

beforeEach(() => {
  fromMock.mockReset();
  limitMock.mockReset();
  pantryMock.mockReset();
  weekMock.mockReset();
  answerMock.mockReset();
});

describe("POST /api/assistant/suggest", () => {
  it("returns 401 when unauthenticated", async () => {
    setLimit({ userId: null, allowed: false });
    const res = await suggestPOST(makeRequest("/api/assistant/suggest", { pantry: "Eier" }));
    expect(res.status).toBe(401);
  });

  it("returns 429 with the German limit message when exhausted", async () => {
    setLimit({ allowed: false, count: 30 });
    const res = await suggestPOST(
      makeRequest("/api/assistant/suggest", { pantry: "Eier und Mehl" })
    );
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toContain("Tageslimit erreicht");
  });

  it("validates the pantry text", async () => {
    setLimit();
    const res = await suggestPOST(makeRequest("/api/assistant/suggest", { pantry: "ab" }));
    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns enriched suggestions for valid input", async () => {
    setLimit();
    fromMock.mockReturnValueOnce(makeListChain({ data: [RECIPE_ROW], error: null }));
    pantryMock.mockResolvedValueOnce([
      { recipe_id: "r1", reason: "Passt.", missing: ["Basilikum"] },
    ]);

    const res = await suggestPOST(
      makeRequest("/api/assistant/suggest", { pantry: "Tomaten und Nudeln" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.suggestions).toHaveLength(1);
    expect(body.data.suggestions[0].recipe.title).toBe("Tomatensoße");
    expect(body.data.suggestions[0].recipe.total_time).toBe(30);
    expect(body.data.suggestions[0].missing).toEqual(["Basilikum"]);
  });

  it("returns 502 with a German message when Claude fails", async () => {
    setLimit();
    fromMock.mockReturnValueOnce(makeListChain({ data: [RECIPE_ROW], error: null }));
    pantryMock.mockRejectedValueOnce(new Error("api down"));

    const res = await suggestPOST(
      makeRequest("/api/assistant/suggest", { pantry: "Tomaten und Nudeln" })
    );
    expect(res.status).toBe(502);
  });
});

describe("POST /api/assistant/week-plan", () => {
  it("returns 401 when unauthenticated", async () => {
    setLimit({ userId: null, allowed: false });
    const res = await weekPlanPOST(makeRequest("/api/assistant/week-plan", {}));
    expect(res.status).toBe(401);
  });

  it("computes open Abend slots (occupied ones excluded) and enriches titles", async () => {
    setLimit();
    // entries: Monday dinner already planned
    fromMock.mockReturnValueOnce(
      makeListChain({
        data: [
          { date: "2026-06-15", meal_slot: "abend", recipe_id: "r9", created_at: "x" },
        ],
        error: null,
      })
    );
    fromMock.mockReturnValueOnce(makeListChain({ data: [RECIPE_ROW], error: null }));
    weekMock.mockResolvedValueOnce([
      { date: "2026-06-16", meal_slot: "abend", recipe_id: "r1" },
    ]);

    const res = await weekPlanPOST(
      makeRequest("/api/assistant/week-plan", { week: "2026-06-15" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.week).toBe("2026-06-15");
    expect(body.data.suggestions).toEqual([
      { date: "2026-06-16", meal_slot: "abend", recipe_id: "r1", recipe_title: "Tomatensoße" },
    ]);

    const openSlots = weekMock.mock.calls[0][0].openSlots as Array<{ date: string }>;
    expect(openSlots).toHaveLength(6); // 7 days minus the occupied Monday
    expect(openSlots.map((s) => s.date)).not.toContain("2026-06-15");
    // recently planned feeds variety
    expect(weekMock.mock.calls[0][0].recentRecipeIds).toContain("r9");
  });

  it("returns 503 when the meal-plan table is missing", async () => {
    setLimit();
    fromMock.mockReturnValueOnce(
      makeListChain({ data: null, error: { code: "42P01", message: "missing" } })
    );
    fromMock.mockReturnValueOnce(makeListChain({ data: [RECIPE_ROW], error: null }));

    const res = await weekPlanPOST(makeRequest("/api/assistant/week-plan", {}));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/assistant/cooking-question", () => {
  const validBody = {
    recipe_id: "r1",
    question: "Kann ich Dosentomaten nehmen?",
    step_index: 0,
    servings: 4,
  };

  it("returns 401 when unauthenticated", async () => {
    setLimit({ userId: null, allowed: false });
    const res = await questionPOST(makeRequest("/api/assistant/cooking-question", validBody));
    expect(res.status).toBe(401);
  });

  it("validates the question", async () => {
    setLimit();
    const res = await questionPOST(
      makeRequest("/api/assistant/cooking-question", { ...validBody, question: "hm" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for foreign recipes (owner-scoped fetch)", async () => {
    setLimit();
    fromMock.mockReturnValueOnce(makeListChain({ data: null, error: null }));

    const res = await questionPOST(makeRequest("/api/assistant/cooking-question", validBody));
    expect(res.status).toBe(404);
  });

  it("returns the answer with the current step text resolved", async () => {
    setLimit();
    fromMock.mockReturnValueOnce(
      makeListChain({
        data: {
          ...RECIPE_ROW,
          steps: [{ order: 1, text: "Tomaten schneiden.", timerSeconds: null }],
          sections: null,
        },
        error: null,
      })
    );
    answerMock.mockResolvedValueOnce("Ja, das geht gut.");

    const res = await questionPOST(makeRequest("/api/assistant/cooking-question", validBody));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.answer).toBe("Ja, das geht gut.");
    expect(answerMock.mock.calls[0][0].currentStepText).toBe("Tomaten schneiden.");
    expect(answerMock.mock.calls[0][0].servings).toBe(4);
  });
});
