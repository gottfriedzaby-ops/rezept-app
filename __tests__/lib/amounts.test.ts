import {
  buildInlineAmountsPreamble,
  buildKnownAmountsPreamble,
  UNICODE_FRACTIONS,
} from "@/lib/amounts";

describe("buildInlineAmountsPreamble", () => {
  it("returns empty string when no amounts are present", () => {
    expect(buildInlineAmountsPreamble("Schritt 1: Zwiebeln hacken")).toBe("");
    expect(buildInlineAmountsPreamble("")).toBe("");
  });

  it("keeps ml amounts as-is", () => {
    const result = buildInlineAmountsPreamble("300ml Kirschbier");
    expect(result).toContain("300 ml");
    expect(result).toContain('"Kirschbier"');
  });

  it("keeps g amounts as-is", () => {
    const result = buildInlineAmountsPreamble("500 g Mehl");
    expect(result).toContain("500 g");
    expect(result).toContain('"Mehl"');
  });

  it("converts EL to ml (×15)", () => {
    const result = buildInlineAmountsPreamble("2 EL Honig");
    expect(result).toContain("30 ml");
    expect(result).toContain('"Honig"');
  });

  it("converts a single EL to 15ml", () => {
    const result = buildInlineAmountsPreamble("1 EL Olivenöl");
    expect(result).toContain("15 ml");
  });

  it("converts TL to ml (×5)", () => {
    const result = buildInlineAmountsPreamble("1 TL Salz");
    expect(result).toContain("5 ml");
    expect(result).toContain('"Salz"');
  });

  it("converts 2 TL to 10ml", () => {
    const result = buildInlineAmountsPreamble("2 TL Backpulver");
    expect(result).toContain("10 ml");
  });

  it("converts Prise to g (×0.5)", () => {
    const result = buildInlineAmountsPreamble("1 Prise Pfeffer");
    expect(result).toContain("0.5 g");
    expect(result).toContain('"Pfeffer"');
  });

  it("converts l to ml (×1000)", () => {
    const result = buildInlineAmountsPreamble("1 l Wasser");
    expect(result).toContain("1000 ml");
    expect(result).toContain('"Wasser"');
  });

  it("converts 0.5 l to 500ml", () => {
    const result = buildInlineAmountsPreamble("0,5 l Gemüsebrühe");
    expect(result).toContain("500 ml");
  });

  it("handles decimal amounts with comma separator", () => {
    const result = buildInlineAmountsPreamble("1,5 kg Kartoffeln");
    expect(result).toContain("1.5 kg");
  });

  it("parses multiple ingredients from multi-line text", () => {
    const text = `300ml Kirschbier
2 EL Honig
1 TL Zimt
500 g Mehl`;
    const result = buildInlineAmountsPreamble(text);
    expect(result).toContain('"Kirschbier"');
    expect(result).toContain('"Honig"');
    expect(result).toContain('"Zimt"');
    expect(result).toContain('"Mehl"');
  });

  it("includes the preamble header text", () => {
    const result = buildInlineAmountsPreamble("100 g Zucker");
    expect(result).toContain("KNOWN INGREDIENT AMOUNTS");
  });

  it("skips lines with zero or negative amounts", () => {
    expect(buildInlineAmountsPreamble("0 g Salz")).toBe("");
  });
});

describe("buildKnownAmountsPreamble", () => {
  it("returns empty string when no parenthetical amounts are present", () => {
    expect(buildKnownAmountsPreamble("2 cups flour")).toBe("");
    expect(buildKnownAmountsPreamble("")).toBe("");
  });

  it("parses grams from parenthetical", () => {
    const result = buildKnownAmountsPreamble("2 cups flour (500 grams)");
    expect(result).toContain("500 g");
  });

  it("parses ml from parenthetical", () => {
    const result = buildKnownAmountsPreamble("2 cups milk (480 ml)");
    expect(result).toContain("480 ml");
  });

  it("parses kg from parenthetical", () => {
    const result = buildKnownAmountsPreamble("2 pounds butter (1 kg)");
    expect(result).toContain("1 kg");
  });

  it("parses litres from parenthetical", () => {
    const result = buildKnownAmountsPreamble("4 cups water (1 l)");
    expect(result).toContain("1 l");
  });

  it("parses unicode fraction ½ as 0.5", () => {
    const result = buildKnownAmountsPreamble("a pinch of salt (½ gram)");
    expect(result).toContain("0.5 g");
  });

  it("parses unicode fraction ¼ as 0.25", () => {
    const result = buildKnownAmountsPreamble("sprinkle (¼ g)");
    expect(result).toContain("0.25 g");
  });

  it("parses unicode fraction ¾ as 0.75", () => {
    const result = buildKnownAmountsPreamble("(¾ g) sugar");
    expect(result).toContain("0.75 g");
  });

  it("includes context from text preceding the parenthetical", () => {
    const result = buildKnownAmountsPreamble("2 cups flour (500 grams)");
    expect(result).toContain("2 cups flour <PAREN>");
  });

  it("includes the preamble header text", () => {
    const result = buildKnownAmountsPreamble("(100 grams) butter");
    expect(result).toContain("KNOWN METRIC AMOUNTS");
  });

  it("handles 'millilitres' spelling", () => {
    const result = buildKnownAmountsPreamble("(250 millilitres) cream");
    expect(result).toContain("250 ml");
  });

  it("handles 'gram' singular", () => {
    const result = buildKnownAmountsPreamble("(1 gram) yeast");
    expect(result).toContain("1 g");
  });
});

describe("buildKnownAmountsPreamble — mixed metric/imperial source patterns", () => {
  it("OONI water line: extracts 320 g and includes 'water' in context", () => {
    const result = buildKnownAmountsPreamble("1 ¼ cups plus 4 tablespoons (320 grams) water");
    expect(result).toContain("320 g");
    expect(result).toContain("water");
  });

  it("OONI salt line: extracts 10 g and includes 'fine sea salt' in context", () => {
    const result = buildKnownAmountsPreamble("2 scant teaspoons (10 grams) fine sea salt");
    expect(result).toContain("10 g");
    expect(result).toContain("fine sea salt");
  });

  it("OONI yeast line: extracts 0.5 g and includes 'instant dried yeast' in context", () => {
    const result = buildKnownAmountsPreamble("½ of ¼ teaspoons (½ gram) instant dried yeast");
    expect(result).toContain("0.5 g");
    expect(result).toContain("instant dried yeast");
  });

  it("OONI flour line: extracts 500 g and includes 'strong white flour' in context", () => {
    const result = buildKnownAmountsPreamble("4 ½ cups (500 grams) strong white flour");
    expect(result).toContain("500 g");
    expect(result).toContain("strong white flour");
  });

  it("strips 'heaping' qualifier inside parens", () => {
    const result = buildKnownAmountsPreamble("¼ teaspoon (heaping ½ gram) active dried yeast");
    expect(result).toContain("0.5 g");
    expect(result).toContain("active dried yeast");
  });

  it("strips 'scant' qualifier inside parens", () => {
    const result = buildKnownAmountsPreamble("(scant 10 grams) salt");
    expect(result).toContain("10 g");
    expect(result).toContain("salt");
  });

  it("strips 'about' qualifier inside parens", () => {
    const result = buildKnownAmountsPreamble("2 cups (about 250 ml) milk");
    expect(result).toContain("250 ml");
    expect(result).toContain("milk");
  });

  it("strips 'ca.' qualifier inside parens", () => {
    const result = buildKnownAmountsPreamble("2 tbsp (ca. 30 g) butter");
    expect(result).toContain("30 g");
    expect(result).toContain("butter");
  });

  it("strips 'approximately' qualifier inside parens", () => {
    const result = buildKnownAmountsPreamble("(approximately 1 kg) potatoes");
    expect(result).toContain("1 kg");
    expect(result).toContain("potatoes");
  });

  it("strips 'roughly' qualifier inside parens", () => {
    const result = buildKnownAmountsPreamble("(roughly 500 ml) stock");
    expect(result).toContain("500 ml");
    expect(result).toContain("stock");
  });

  it("does not match unsupported qualifier like 'maybe'", () => {
    expect(buildKnownAmountsPreamble("(maybe 50 grams) flour")).toBe("");
  });

  it("extracts all four OONI ingredient lines from a combined block", () => {
    const text = [
      "1 ¼ cups plus 4 tablespoons (320 grams) water",
      "2 scant teaspoons (10 grams) fine sea salt",
      "½ of ¼ teaspoons (½ gram) instant dried yeast or ¼ teaspoon (heaping ½ gram) active dried yeast",
      "4 ½ cups (500 grams) strong white flour",
    ].join(" ");
    const result = buildKnownAmountsPreamble(text);
    expect(result).toContain("320 g");
    expect(result).toContain("10 g");
    expect(result).toContain("0.5 g");
    expect(result).toContain("500 g");
    expect(result).toContain("water");
    expect(result).toContain("fine sea salt");
    expect(result).toContain("instant dried yeast");
    expect(result).toContain("strong white flour");
  });

  it("emits each entry with a <PAREN> marker between before and after context", () => {
    const result = buildKnownAmountsPreamble("4 ½ cups (500 grams) strong white flour");
    expect(result).toContain("<PAREN>");
    expect(result).toMatch(/4 ½ cups <PAREN> strong white flour/);
  });
});

describe("UNICODE_FRACTIONS", () => {
  it("maps ½ to 0.5", () => expect(UNICODE_FRACTIONS["½"]).toBe(0.5));
  it("maps ¼ to 0.25", () => expect(UNICODE_FRACTIONS["¼"]).toBe(0.25));
  it("maps ¾ to 0.75", () => expect(UNICODE_FRACTIONS["¾"]).toBe(0.75));
  it("maps ⅛ to 0.125", () => expect(UNICODE_FRACTIONS["⅛"]).toBe(0.125));
});
