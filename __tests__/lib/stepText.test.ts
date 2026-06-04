import { formatScaledAmount, resolveStepText } from "@/lib/stepText";
import type { Ingredient } from "@/types/recipe";

const ing = (name: string, amount: number, unit = ""): Ingredient => ({ name, amount, unit });

describe("formatScaledAmount", () => {
  it("multiplies the per-serving amount by the servings", () => {
    expect(formatScaledAmount(50, 4)).toBe("200");
  });

  it("renders one decimal place when needed and trims whole numbers", () => {
    expect(formatScaledAmount(2.5, 3)).toBe("7.5");
    expect(formatScaledAmount(1, 4)).toBe("4");
  });

  it("returns an empty string for non-positive or invalid amounts", () => {
    expect(formatScaledAmount(0, 4)).toBe("");
    expect(formatScaledAmount(-5, 2)).toBe("");
    expect(formatScaledAmount(Number.NaN, 2)).toBe("");
  });
});

describe("resolveStepText", () => {
  // Amounts are stored per serving; a 4-serving recipe stores 50 g flour per serving.
  const ingredients = [ing("Mehl", 50, "g"), ing("Olivenöl", 0.5, "EL"), ing("Zwiebel", 0.25)];

  it("returns the text unchanged when there are no placeholders", () => {
    expect(resolveStepText("Zwiebeln fein hacken.", ingredients, 4)).toBe("Zwiebeln fein hacken.");
  });

  it("expands a placeholder into amount + unit + name for the scaled servings", () => {
    expect(resolveStepText("{{Mehl}} unterrühren.", ingredients, 4)).toBe("200 g Mehl unterrühren.");
  });

  it("rescales the amount when servings change", () => {
    expect(resolveStepText("{{Mehl}} unterrühren.", ingredients, 8)).toBe("400 g Mehl unterrühren.");
  });

  it("omits the unit when the ingredient has none", () => {
    expect(resolveStepText("{{Zwiebel}} dazugeben.", ingredients, 4)).toBe("1 Zwiebel dazugeben.");
  });

  it("handles multiple placeholders in one step", () => {
    expect(resolveStepText("{{Olivenöl}} erhitzen, dann {{Mehl}} zugeben.", ingredients, 4)).toBe(
      "2 EL Olivenöl erhitzen, dann 200 g Mehl zugeben."
    );
  });

  it("matches ingredient names case-insensitively and tolerates whitespace", () => {
    expect(resolveStepText("{{  mehl  }} sieben.", ingredients, 2)).toBe("100 g Mehl sieben.");
  });

  it("falls back to the placeholder text when the ingredient is unknown", () => {
    expect(resolveStepText("{{Wasser}} angießen.", ingredients, 4)).toBe("Wasser angießen.");
  });

  it("shows only the name when the ingredient amount is zero (nach Bedarf)", () => {
    const list = [ing("Salz", 0, "nach Bedarf")];
    expect(resolveStepText("Mit {{Salz}} würzen.", list, 4)).toBe("Mit Salz würzen.");
  });
});
