import { POST } from "@/app/api/admin/normalize-tags/route";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase";

const fromMock = supabaseAdmin.from as jest.Mock;

function makeSelectChain(data: unknown) {
  return {
    select: jest.fn().mockResolvedValue({ data, error: null }),
  };
}

function makeUpdateChain() {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("POST /api/admin/normalize-tags", () => {
  it("returns 200 with updated=0 when there are no recipes", async () => {
    fromMock.mockReturnValue(makeSelectChain([]));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(0);
  });

  it("returns message when no recipes are found (null data)", async () => {
    fromMock.mockReturnValue(makeSelectChain(null));

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.updated).toBe(0);
  });

  it("does not update recipes whose tags are already canonical", async () => {
    fromMock.mockReturnValue(
      makeSelectChain([
        { id: "r1", title: "Pasta", tags: ["pasta", "vegetarisch"] },
      ])
    );

    const res = await POST();
    const body = await res.json();

    expect(body.updated).toBe(0);
    expect(body.changes).toHaveLength(0);
    // Only one from() call (the select), no update calls
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes synonyms and updates changed recipes", async () => {
    fromMock
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "r1", title: "Pasta Rezept", tags: ["vegetarian", "easy"] },
          { id: "r2", title: "Steak", tags: ["fleisch", "grilled"] },
          { id: "r3", title: "Salat", tags: ["salat"] }, // already canonical
        ])
      )
      .mockReturnValue(makeUpdateChain()); // handles the two update calls

    const res = await POST();
    const body = await res.json();

    expect(body.total).toBe(3);
    expect(body.updated).toBe(2);
    expect(body.changes).toHaveLength(2);
  });

  it("includes before/after in the changes log", async () => {
    fromMock
      .mockReturnValueOnce(
        makeSelectChain([{ id: "r1", title: "Test", tags: ["vegetarian"] }])
      )
      .mockReturnValue(makeUpdateChain());

    const res = await POST();
    const body = await res.json();

    const change = body.changes[0];
    expect(change.before).toEqual(["vegetarian"]);
    expect(change.after).toEqual(["vegetarisch"]);
    expect(change.id).toBe("r1");
    expect(change.title).toBe("Test");
  });

  it("deduplicates synonyms in the normalized output", async () => {
    fromMock
      .mockReturnValueOnce(
        makeSelectChain([
          { id: "r1", title: "Test", tags: ["veggie", "vegetarisch"] },
        ])
      )
      .mockReturnValue(makeUpdateChain());

    const res = await POST();
    const body = await res.json();

    expect(body.changes[0].after).toEqual(["vegetarisch"]);
  });

  it("returns 500 on database fetch error", async () => {
    fromMock.mockReturnValue({
      select: jest.fn().mockResolvedValue({ data: null, error: { message: "DB down" } }),
    });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
  });
});
