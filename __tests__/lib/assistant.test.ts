jest.mock("@/lib/claude", () => {
  const actual = jest.requireActual("@/lib/claude");
  return { ...actual, claudeCreate: jest.fn() };
});

import { claudeCreate } from "@/lib/claude";
import {
  suggestRecipesFromPantry,
  suggestWeekPlan,
  answerCookingQuestion,
  toAssistantSummary,
  type AssistantRecipeSummary,
} from "@/lib/assistant";

const claudeCreateMock = claudeCreate as jest.Mock;

function mockClaudeText(text: string) {
  claudeCreateMock.mockResolvedValueOnce({
    message: { content: [{ type: "text", text }] },
    meta: {},
  });
}

function makeSummary(id: string, overrides: Partial<AssistantRecipeSummary> = {}): AssistantRecipeSummary {
  return {
    id,
    title: `Rezept ${id}`,
    tags: ["pasta"],
    recipe_type: "kochen",
    total_time: 30,
    ingredients: ["Tomaten", "Nudeln"],
    ...overrides,
  };
}

beforeEach(() => {
  claudeCreateMock.mockReset();
});

describe("toAssistantSummary", () => {
  it("flattens section ingredients and caps the list at 15 names", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      amount: 1,
      unit: "g",
      name: `Zutat ${i}`,
    }));
    const summary = toAssistantSummary({
      id: "r1",
      title: "Test",
      tags: null,
      recipe_type: "backen",
      prep_time: 10,
      cook_time: 25,
      ingredients: [],
      sections: [{ title: "Teig", ingredients: many, steps: [] }],
    });

    expect(summary.total_time).toBe(35);
    expect(summary.ingredients).toHaveLength(15);
    expect(summary.tags).toEqual([]);
  });
});

describe("suggestRecipesFromPantry", () => {
  it("returns validated suggestions and uses claude-sonnet-4-6", async () => {
    mockClaudeText(
      JSON.stringify([
        { recipe_id: "r1", reason: "Passt gut.", missing: ["Sahne"] },
        { recipe_id: "r2", reason: "Auch gut.", missing: [] },
      ])
    );

    const result = await suggestRecipesFromPantry(
      "Tomaten, Nudeln, Zwiebeln",
      [makeSummary("r1"), makeSummary("r2")],
      "user-1"
    );

    expect(result).toEqual([
      { recipe_id: "r1", reason: "Passt gut.", missing: ["Sahne"] },
      { recipe_id: "r2", reason: "Auch gut.", missing: [] },
    ]);
    const [fnName, params, userId] = claudeCreateMock.mock.calls[0];
    expect(fnName).toBe("suggestRecipesFromPantry");
    expect(params.model).toBe("claude-sonnet-4-6");
    expect(userId).toBe("user-1");
  });

  it("drops hallucinated ids, duplicates and caps at 5 suggestions", async () => {
    const items = [
      { recipe_id: "ghost", reason: "x", missing: [] },
      { recipe_id: "r1", reason: "a", missing: [] },
      { recipe_id: "r1", reason: "dupe", missing: [] },
      ...["r2", "r3", "r4", "r5", "r6"].map((id) => ({ recipe_id: id, reason: id, missing: [] })),
    ];
    mockClaudeText(JSON.stringify(items));

    const recipes = ["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => makeSummary(id));
    const result = await suggestRecipesFromPantry("Eier", recipes, null);

    expect(result.map((s) => s.recipe_id)).toEqual(["r1", "r2", "r3", "r4", "r5"]);
  });

  it("returns [] without calling Claude when the library is empty", async () => {
    const result = await suggestRecipesFromPantry("Eier", [], null);
    expect(result).toEqual([]);
    expect(claudeCreateMock).not.toHaveBeenCalled();
  });
});

describe("suggestWeekPlan", () => {
  const openSlots = [
    { date: "2026-06-15", meal_slot: "abend" as const },
    { date: "2026-06-16", meal_slot: "abend" as const },
  ];

  it("keeps only suggestions for open slots with unique recipes", async () => {
    mockClaudeText(
      JSON.stringify([
        { date: "2026-06-15", meal_slot: "abend", recipe_id: "r1" },
        { date: "2026-06-15", meal_slot: "abend", recipe_id: "r2" }, // slot already used
        { date: "2026-06-16", meal_slot: "mittag", recipe_id: "r2" }, // not an open slot
        { date: "2026-06-16", meal_slot: "abend", recipe_id: "r1" }, // recipe already used
        { date: "2026-06-16", meal_slot: "abend", recipe_id: "r2" },
      ])
    );

    const result = await suggestWeekPlan(
      { openSlots, recipes: [makeSummary("r1"), makeSummary("r2")], recentRecipeIds: [] },
      "user-1"
    );

    expect(result).toEqual([
      { date: "2026-06-15", meal_slot: "abend", recipe_id: "r1" },
      { date: "2026-06-16", meal_slot: "abend", recipe_id: "r2" },
    ]);
  });

  it("mentions recently planned recipes in the prompt", async () => {
    mockClaudeText("[]");
    await suggestWeekPlan(
      { openSlots, recipes: [makeSummary("r1")], recentRecipeIds: ["r9"] },
      null
    );
    const prompt = claudeCreateMock.mock.calls[0][1].messages[0].content as string;
    expect(prompt).toContain("r9");
  });

  it("returns [] without calling Claude when there are no open slots", async () => {
    const result = await suggestWeekPlan(
      { openSlots: [], recipes: [makeSummary("r1")], recentRecipeIds: [] },
      null
    );
    expect(result).toEqual([]);
    expect(claudeCreateMock).not.toHaveBeenCalled();
  });
});

describe("answerCookingQuestion", () => {
  const context = {
    title: "Tomatensoße",
    servings: 4,
    sections: [
      {
        title: null,
        ingredients: [{ amount: 200, unit: "g", name: "Tomaten" }],
        steps: [{ order: 1, text: "Tomaten schneiden.", timerSeconds: null }],
      },
    ],
    currentStepText: "Tomaten schneiden.",
    question: "Kann ich Dosentomaten nehmen?",
  };

  it("returns the trimmed answer and uses claude-haiku-4-5", async () => {
    mockClaudeText("  Ja, Dosentomaten funktionieren hier gut. ");

    const answer = await answerCookingQuestion(context, "user-1");

    expect(answer).toBe("Ja, Dosentomaten funktionieren hier gut.");
    const [fnName, params] = claudeCreateMock.mock.calls[0];
    expect(fnName).toBe("answerCookingQuestion");
    expect(params.model).toBe("claude-haiku-4-5");
    const prompt = params.messages[0].content as string;
    expect(prompt).toContain("Tomatensoße");
    expect(prompt).toContain("Aktueller Schritt: Tomaten schneiden.");
  });

  it("returns null for an empty answer", async () => {
    mockClaudeText("   ");
    expect(await answerCookingQuestion(context, null)).toBeNull();
  });
});
