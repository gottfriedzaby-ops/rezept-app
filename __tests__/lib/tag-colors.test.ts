import { getTagColor, getRecipeGradient } from "@/lib/tag-colors";

describe("getTagColor", () => {
  it("returns vegetarisch colors for 'vegetarisch'", () => {
    const { bg, text } = getTagColor("vegetarisch");
    expect(bg).toBe("#E8EEE9");
    expect(text).toBe("#2D5F3F");
  });

  it("returns vegan colors for 'vegan'", () => {
    const { bg, text } = getTagColor("vegan");
    expect(bg).toBe("#D8EAD8");
    expect(text).toBe("#1F4A2E");
  });

  it("returns default gray for a completely unknown tag", () => {
    const { bg, text } = getTagColor("pilzrisotto");
    expect(bg).toBe("#F3F1EC");
    expect(text).toBe("#6B6B66");
  });

  it("is case-insensitive (uppercase input matches)", () => {
    const lower = getTagColor("vegan");
    const upper = getTagColor("VEGAN");
    expect(upper.bg).toBe(lower.bg);
    expect(upper.text).toBe(lower.text);
  });

  it("returns dessert colors for 'dessert'", () => {
    const { bg } = getTagColor("dessert");
    expect(bg).toBe("#F0E4E4");
  });

  it("uses substring match — 'vegane-küche' matches 'vegan'", () => {
    const { bg } = getTagColor("vegane-küche");
    expect(bg).toBe("#D8EAD8");
  });

  it("uses substring match — 'pasta-gericht' matches 'pasta'", () => {
    const { bg } = getTagColor("pasta-gericht");
    expect(bg).toBe("#F0E8DC");
  });

  it("returns correct colors for 'glutenfrei'", () => {
    const { bg } = getTagColor("glutenfrei");
    expect(bg).toBe("#E8F0E0");
  });

  it("returns correct colors for 'frühstück'", () => {
    const { bg } = getTagColor("frühstück");
    expect(bg).toBe("#F0ECD4");
  });
});

describe("getRecipeGradient", () => {
  it("returns gradient for first matching tag in the array", () => {
    const gradient = getRecipeGradient(["pasta", "vegan"]);
    expect(gradient).toEqual(["#F0E8DC", "#E4D8C4"]);
  });

  it("returns default gradient for empty array", () => {
    const gradient = getRecipeGradient([]);
    expect(gradient).toEqual(["#F3F1EC", "#E8E4DC"]);
  });

  it("returns default gradient when no tags match", () => {
    const gradient = getRecipeGradient(["pilzrisotto", "sonstiges"]);
    expect(gradient).toEqual(["#F3F1EC", "#E8E4DC"]);
  });

  it("picks first matching tag, not just any matching tag", () => {
    const gradientVeg = getRecipeGradient(["vegetarisch"]);
    const gradientPasta = getRecipeGradient(["pasta"]);
    const gradientBoth = getRecipeGradient(["vegetarisch", "pasta"]);
    expect(gradientBoth).toEqual(gradientVeg);
    expect(gradientBoth).not.toEqual(gradientPasta);
  });

  it("returns a tuple of two strings", () => {
    const gradient = getRecipeGradient(["vegan"]);
    expect(Array.isArray(gradient)).toBe(true);
    expect(gradient.length).toBe(2);
    expect(typeof gradient[0]).toBe("string");
    expect(typeof gradient[1]).toBe("string");
  });
});
