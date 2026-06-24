import type { ParsedRecipe } from "@/types/recipe";

// Control what the Anthropic client returns for the review pass.
const mockCreate = jest.fn();
jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Keep the API-call logger inert so the review pass never touches Supabase.
jest.mock("@/lib/claude-api-tracking", () => ({
  logClaudeCall: jest.fn(),
  truncateError: (m: string) => m,
}));

import { reviewAndImproveRecipe } from "@/lib/claude";

function textMessage(text: string) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const PARSED: ParsedRecipe = {
  title: "Mangold-Linsen-Curry",
  servings: 4,
  prepTime: 15,
  cookTime: 25,
  recipe_type: "kochen",
  sections: [
    {
      title: null,
      ingredients: [
        { amount: 62.5, unit: "g", name: "Mangold" },
        { amount: 0.25, unit: "Stück", name: "Zwiebel" },
      ],
      steps: [{ order: 1, text: "{{Mangold}} waschen.", timerSeconds: null }],
    },
  ],
  tags: ["vegetarisch"],
  source: { type: "pdf", value: "Mangold-Linsen-Curry.pdf" },
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe("reviewAndImproveRecipe", () => {
  it("falls back to the parsed recipe when the review JSON is unparseable", async () => {
    // Reproduces the reported failure: a malformed response that even the
    // quote-repair pass cannot rescue (JSON.parse throws "Expected property
    // name or '}' in JSON at position 1").
    mockCreate.mockResolvedValueOnce(textMessage("{x: 1"));

    const { recipe } = await reviewAndImproveRecipe(PARSED, "u1");

    // The import survives: we get the already-valid parse-pass recipe back
    // unchanged instead of an error.
    expect(recipe).toEqual(PARSED);
  });

  it("falls back when the response contains no JSON at all", async () => {
    mockCreate.mockResolvedValueOnce(textMessage("Entschuldigung, ich kann das nicht."));

    const { recipe } = await reviewAndImproveRecipe(PARSED, "u1");

    expect(recipe).toEqual(PARSED);
  });

  it("uses the reviewed recipe but restores the parse-pass amounts on success", async () => {
    mockCreate.mockResolvedValueOnce(
      textMessage(
        JSON.stringify({
          title: "Mangold-Linsen-Curry (verbessert)",
          servings: 4,
          prepTime: 15,
          cookTime: 25,
          recipe_type: "kochen",
          sections: [
            {
              title: null,
              // Review pass may report different amounts — they must be ignored
              // in favour of the authoritative parse-pass values.
              ingredients: [
                { amount: 999, unit: "kg", name: "Mangold" },
                { amount: 999, unit: "kg", name: "Zwiebel" },
              ],
              steps: [{ order: 1, text: "{{Mangold}} gründlich waschen.", timerSeconds: null }],
            },
          ],
          tags: ["vegetarisch", "vegan"],
          source: { type: "pdf", value: "ignored" },
        }),
      ),
    );

    const { recipe } = await reviewAndImproveRecipe(PARSED, "u1");

    expect(recipe.title).toBe("Mangold-Linsen-Curry (verbessert)");
    // Amounts/units come from the parse pass, not the review pass.
    expect(recipe.sections[0].ingredients).toEqual([
      { amount: 62.5, unit: "g", name: "Mangold" },
      { amount: 0.25, unit: "Stück", name: "Zwiebel" },
    ]);
    // source/servings are restored from the original parse.
    expect(recipe.source).toEqual(PARSED.source);
    expect(recipe.servings).toBe(4);
  });
});
