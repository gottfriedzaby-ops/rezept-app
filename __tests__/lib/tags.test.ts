import { normalizeTag, normalizeTags } from "@/lib/tags";

describe("normalizeTag", () => {
  // Dietary
  it("maps 'vegetarian' → 'vegetarisch'", () => {
    expect(normalizeTag("vegetarian")).toBe("vegetarisch");
  });
  it("maps 'veggie' → 'vegetarisch'", () => {
    expect(normalizeTag("veggie")).toBe("vegetarisch");
  });
  it("maps 'vegan' → 'vegan'", () => {
    expect(normalizeTag("vegan")).toBe("vegan");
  });
  it("maps 'gluten-free' → 'glutenfrei'", () => {
    expect(normalizeTag("gluten-free")).toBe("glutenfrei");
  });
  it("maps 'gluten free' (space) → 'glutenfrei'", () => {
    expect(normalizeTag("gluten free")).toBe("glutenfrei");
  });
  it("maps 'lactose-free' → 'laktosefrei'", () => {
    expect(normalizeTag("lactose-free")).toBe("laktosefrei");
  });

  // Cuisines
  it("maps 'italian' → 'italienisch'", () => {
    expect(normalizeTag("italian")).toBe("italienisch");
  });
  it("maps 'french' → 'französisch'", () => {
    expect(normalizeTag("french")).toBe("französisch");
  });
  it("maps 'chinese' → 'chinesisch'", () => {
    expect(normalizeTag("chinese")).toBe("chinesisch");
  });
  it("keeps already-canonical 'italienisch'", () => {
    expect(normalizeTag("italienisch")).toBe("italienisch");
  });

  // Meal types
  it("maps 'breakfast' → 'frühstück'", () => {
    expect(normalizeTag("breakfast")).toBe("frühstück");
  });
  it("maps 'lunch' → 'mittagessen'", () => {
    expect(normalizeTag("lunch")).toBe("mittagessen");
  });
  it("maps 'dinner' → 'abendessen'", () => {
    expect(normalizeTag("dinner")).toBe("abendessen");
  });
  it("maps 'supper' → 'abendessen'", () => {
    expect(normalizeTag("supper")).toBe("abendessen");
  });
  it("maps 'desserts' → 'dessert'", () => {
    expect(normalizeTag("desserts")).toBe("dessert");
  });
  it("maps 'nachtisch' → 'dessert'", () => {
    expect(normalizeTag("nachtisch")).toBe("dessert");
  });
  it("maps 'side dish' → 'beilage'", () => {
    expect(normalizeTag("side dish")).toBe("beilage");
  });
  it("maps 'starter' → 'vorspeise'", () => {
    expect(normalizeTag("starter")).toBe("vorspeise");
  });
  it("maps 'main course' → 'hauptgericht'", () => {
    expect(normalizeTag("main course")).toBe("hauptgericht");
  });

  // Difficulty
  it("maps 'easy' → 'einfach'", () => {
    expect(normalizeTag("easy")).toBe("einfach");
  });
  it("maps 'simple' → 'einfach'", () => {
    expect(normalizeTag("simple")).toBe("einfach");
  });
  it("maps 'medium' → 'mittel'", () => {
    expect(normalizeTag("medium")).toBe("mittel");
  });
  it("maps 'hard' → 'aufwändig'", () => {
    expect(normalizeTag("hard")).toBe("aufwändig");
  });
  it("maps 'aufwendig' → 'aufwändig'", () => {
    expect(normalizeTag("aufwendig")).toBe("aufwändig");
  });

  // Cooking methods
  it("maps 'baked' → 'gebacken'", () => {
    expect(normalizeTag("baked")).toBe("gebacken");
  });
  it("maps 'grilled' → 'gegrillt'", () => {
    expect(normalizeTag("grilled")).toBe("gegrillt");
  });
  it("maps 'raw' → 'roh'", () => {
    expect(normalizeTag("raw")).toBe("roh");
  });

  // Unknown tag passthrough
  it("returns unknown tag as-is (lowercased)", () => {
    expect(normalizeTag("Pilzrisotto")).toBe("pilzrisotto");
  });
  it("returns already-lowercase unknown tag unchanged", () => {
    expect(normalizeTag("pilzrisotto")).toBe("pilzrisotto");
  });

  // Whitespace and punctuation cleanup
  it("trims leading and trailing whitespace", () => {
    expect(normalizeTag("  vegan  ")).toBe("vegan");
  });
  it("collapses internal whitespace", () => {
    expect(normalizeTag("gluten  free")).toBe("glutenfrei");
  });
  it("strips trailing punctuation", () => {
    expect(normalizeTag("pasta!")).toBe("pasta");
  });
  it("strips trailing period", () => {
    expect(normalizeTag("pasta.")).toBe("pasta");
  });

  // Case insensitivity
  it("is case-insensitive for lookup", () => {
    expect(normalizeTag("VEGAN")).toBe("vegan");
    expect(normalizeTag("Italian")).toBe("italienisch");
  });
});

describe("normalizeTags", () => {
  it("returns empty array for empty input", () => {
    expect(normalizeTags([])).toEqual([]);
  });

  it("normalizes each tag in the array", () => {
    expect(normalizeTags(["vegetarian", "easy"])).toEqual(["vegetarisch", "einfach"]);
  });

  it("deduplicates tags that map to the same canonical form", () => {
    expect(normalizeTags(["veggie", "vegetarisch"])).toEqual(["vegetarisch"]);
  });

  it("deduplicates identical canonical tags", () => {
    expect(normalizeTags(["vegan", "vegan"])).toEqual(["vegan"]);
  });

  it("preserves the first occurrence when deduplicating", () => {
    const result = normalizeTags(["dessert", "nachtisch"]);
    expect(result).toEqual(["dessert"]);
  });

  it("filters out empty strings", () => {
    expect(normalizeTags(["", "vegan"])).toEqual(["vegan"]);
  });

  it("preserves order of first occurrence", () => {
    const result = normalizeTags(["pasta", "vegan", "vegetarian"]);
    expect(result).toEqual(["pasta", "vegan", "vegetarisch"]);
  });

  it("handles a mix of known and unknown tags", () => {
    const result = normalizeTags(["easy", "pilzrisotto", "italian"]);
    expect(result).toEqual(["einfach", "pilzrisotto", "italienisch"]);
  });
});
