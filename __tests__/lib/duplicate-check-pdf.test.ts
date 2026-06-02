jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

const fromMock = supabaseAdmin.from as jest.Mock;

let eqColumns: string[];
let ilikeColumns: string[];

// Minimal chainable query-builder stub. select/eq/ilike chain; maybeSingle (stage 1)
// and limit (stage 3) are the awaited terminals.
function builder(opts: { exact?: { id: string; title: string } | null; titleCandidates?: Array<{ id: string; title: string }> }) {
  const b: Record<string, jest.Mock> = {};
  b.select = jest.fn(() => b);
  b.eq = jest.fn((col: string) => {
    eqColumns.push(col);
    return b;
  });
  b.ilike = jest.fn((col: string) => {
    ilikeColumns.push(col);
    return b;
  });
  b.maybeSingle = jest.fn(() => Promise.resolve({ data: opts.exact ?? null }));
  b.limit = jest.fn(() => Promise.resolve({ data: opts.titleCandidates ?? [] }));
  return b;
}

beforeEach(() => {
  eqColumns = [];
  ilikeColumns = [];
  fromMock.mockReset();
});

describe("findDuplicateRecipe — PDF source", () => {
  it("skips the exact source_value match (stage 1) for PDFs", async () => {
    fromMock.mockReturnValue(builder({ titleCandidates: [] }));

    const result = await findDuplicateRecipe("Brötchen", "Brötchen.pdf", "u1", "pdf");

    expect(result).toBeNull();
    // Stage 1 (eq on source_value) must NOT run for PDFs.
    expect(eqColumns).not.toContain("source_value");
    // Stage 3 (fuzzy title) must still run.
    expect(ilikeColumns).toContain("title");
  });

  it("still flags a fuzzy title match (stage 3) for PDFs", async () => {
    fromMock.mockReturnValue(builder({ titleCandidates: [{ id: "r1", title: "Brötchen" }] }));

    const result = await findDuplicateRecipe("Brötchen", "andere-datei.pdf", "u1", "pdf");

    expect(result).toEqual({ existingRecipeId: "r1", existingTitle: "Brötchen" });
  });

  it("runs the exact source_value match (stage 1) for non-PDF sources", async () => {
    fromMock.mockReturnValue(builder({ exact: null, titleCandidates: [] }));

    await findDuplicateRecipe("Pasta", "pasta.jpg", "u1", "photo");

    expect(eqColumns).toContain("source_value");
  });
});
