/**
 * Tombstone semantics of the shopping-list store and the client sync layer.
 * Lives in the jsdom project because both depend on localStorage.
 */
import {
  addManualItem,
  clearList,
  getList,
  getRawList,
  removeItem,
  toggleItem,
  saveList,
  STORAGE_KEY,
  type ShoppingListItem,
} from "@/lib/shopping-list";
import { syncShoppingList } from "@/lib/shopping-list-sync";

function makeStoredItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    recipe_id: "recipe-1",
    recipe_title: "Tomatensoße",
    ingredient_name: "Tomaten",
    amount: 300,
    unit: "g",
    checked: false,
    added_at: "2026-06-11T10:00:00.000Z",
    updated_at: "2026-06-11T10:00:00.000Z",
    ...overrides,
  };
}

beforeAll(() => {
  if (typeof globalThis.crypto.randomUUID !== "function") {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: () => `uuid-${Math.random().toString(36).slice(2)}`,
    });
  }
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("shopping list tombstones", () => {
  it("removeItem keeps a tombstone in raw storage but hides it from getList", () => {
    saveList([makeStoredItem()]);

    removeItem("11111111-2222-3333-4444-555555555555");

    expect(getList()).toHaveLength(0);
    const raw = getRawList();
    expect(raw).toHaveLength(1);
    expect(raw[0].deleted_at).toBeTruthy();
    expect(raw[0].updated_at).toBe(raw[0].deleted_at);
  });

  it("clearList tombstones every visible item", () => {
    saveList([makeStoredItem(), makeStoredItem({ id: "22222222-2222-3333-4444-555555555555" })]);

    clearList();

    expect(getList()).toHaveLength(0);
    expect(getRawList()).toHaveLength(2);
    expect(getRawList().every((i) => i.deleted_at)).toBe(true);
  });

  it("toggleItem bumps updated_at and never resurrects tombstones", () => {
    saveList([
      makeStoredItem(),
      makeStoredItem({
        id: "22222222-2222-3333-4444-555555555555",
        deleted_at: "2026-06-11T09:00:00.000Z",
      }),
    ]);

    toggleItem("11111111-2222-3333-4444-555555555555");
    toggleItem("22222222-2222-3333-4444-555555555555"); // tombstoned — no-op

    const raw = getRawList();
    expect(raw[0].checked).toBe(true);
    expect(Date.parse(raw[0].updated_at!)).toBeGreaterThan(
      Date.parse("2026-06-11T10:00:00.000Z")
    );
    expect(raw[1].checked).toBe(false);
  });

  it("addManualItem stamps updated_at", () => {
    addManualItem("Klopapier");
    const [item] = getList();
    expect(item.updated_at).toBe(item.added_at);
  });
});

describe("syncShoppingList", () => {
  it("POSTs the raw list (incl. tombstones) and stores the merged response", async () => {
    const local = makeStoredItem({ deleted_at: "2026-06-11T11:00:00.000Z" });
    saveList([local]);
    const serverItems = [
      makeStoredItem({ id: "33333333-2222-3333-4444-555555555555", ingredient_name: "Mehl" }),
    ];
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { items: serverItems }, error: null }),
    });

    const ok = await syncShoppingList();

    expect(ok).toBe(true);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("/api/shopping-list/sync");
    const sent = JSON.parse(init.body).items;
    expect(sent).toHaveLength(1);
    expect(sent[0].deleted_at).toBe("2026-06-11T11:00:00.000Z");

    expect(getList().map((i) => i.ingredient_name)).toEqual(["Mehl"]);
  });

  it("normalizes legacy items without updated_at before sending", async () => {
    const legacy = makeStoredItem();
    delete (legacy as Partial<ShoppingListItem>).updated_at;
    saveList([legacy]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { items: [] }, error: null }),
    });

    await syncShoppingList();

    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).items;
    expect(sent[0].updated_at).toBe(legacy.added_at);
  });

  it("keeps the local list untouched when the server is unavailable", async () => {
    saveList([makeStoredItem()]);
    (global.fetch as jest.Mock).mockRejectedValue(new Error("offline"));

    const ok = await syncShoppingList();

    expect(ok).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1);
  });

  it("keeps the local list when sync is not set up yet (503)", async () => {
    saveList([makeStoredItem()]);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ data: null, error: "Sync noch nicht eingerichtet." }),
    });

    const ok = await syncShoppingList();

    expect(ok).toBe(false);
    expect(getList()).toHaveLength(1);
  });
});
