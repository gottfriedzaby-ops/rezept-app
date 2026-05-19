import { resolveCookServings } from "@/lib/cookServings";

describe("resolveCookServings", () => {
  it("uses the explicit query value when provided", () => {
    expect(resolveCookServings("4", 8)).toBe(4);
    expect(resolveCookServings("12", null)).toBe(12);
  });

  it("falls back to recipe.servings when the query is missing", () => {
    expect(resolveCookServings(undefined, 6)).toBe(6);
    expect(resolveCookServings("", 6)).toBe(6);
  });

  it("falls back to recipe.servings when the query is non-numeric", () => {
    expect(resolveCookServings("nope", 4)).toBe(4);
    expect(resolveCookServings("NaN", 4)).toBe(4);
  });

  it("falls back to recipe.servings when the query is zero or negative", () => {
    expect(resolveCookServings("0", 3)).toBe(3);
    expect(resolveCookServings("-2", 3)).toBe(3);
  });

  it("uses 1 as the floor when neither query nor recipe has servings", () => {
    expect(resolveCookServings(undefined, null)).toBe(1);
    expect(resolveCookServings("", 0)).toBe(1);
    expect(resolveCookServings("0", null)).toBe(1);
  });
});
