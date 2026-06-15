jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { getFoodByName, saveFood, type FoodDatabaseRow } from "@/lib/food-database-store";
import { supabaseAdmin } from "@/lib/supabase";

const fromMock = supabaseAdmin.from as jest.Mock;

/** from().select().eq().maybeSingle() → result ; from().upsert() → upsertResult */
function setChain(
  selectResult: { data: unknown; error: unknown },
  upsertResult: { error: unknown } = { error: null }
) {
  const maybeSingle = jest.fn().mockResolvedValue(selectResult);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const upsert = jest.fn().mockResolvedValue(upsertResult);
  fromMock.mockReturnValue({ select, upsert });
  return { select, eq, maybeSingle, upsert };
}

const ROW: FoodDatabaseRow = {
  name: "apfel",
  display_name: "Apfel",
  kcal_per_serving: 95,
  protein_g: 0,
  carbs_g: 25,
  fat_g: 0,
  serving_desc: "1 Apfel",
  source: "seed",
};

beforeEach(() => {
  fromMock.mockReset();
});

describe("getFoodByName", () => {
  it("returns null for an empty key without touching the DB", async () => {
    const res = await getFoodByName("");
    expect(res).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the row on a hit", async () => {
    const chain = setChain({ data: ROW, error: null });
    const res = await getFoodByName("apfel");
    expect(res).toEqual(ROW);
    expect(chain.eq).toHaveBeenCalledWith("name", "apfel");
  });

  it("returns null on a miss (no row)", async () => {
    setChain({ data: null, error: null });
    expect(await getFoodByName("unbekannt")).toBeNull();
  });

  it("returns null (no throw) when the table is missing (42P01)", async () => {
    setChain({ data: null, error: { code: "42P01", message: "missing" } });
    expect(await getFoodByName("apfel")).toBeNull();
  });
});

describe("saveFood", () => {
  it("upserts keyed by name and stamps updated_at", async () => {
    const chain = setChain({ data: null, error: null });
    await saveFood(ROW);
    expect(chain.upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = chain.upsert.mock.calls[0];
    expect(payload).toEqual(expect.objectContaining({ name: "apfel", source: "seed" }));
    expect(payload.updated_at).toEqual(expect.any(String));
    expect(options).toEqual({ onConflict: "name" });
  });

  it("does not throw when the table is missing (42P01)", async () => {
    setChain({ data: null, error: null }, { error: { code: "42P01", message: "missing" } });
    await expect(saveFood(ROW)).resolves.toBeUndefined();
  });
});
