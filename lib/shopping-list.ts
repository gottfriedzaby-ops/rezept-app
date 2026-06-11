export interface ShoppingListItem {
  id: string;
  recipe_id: string;
  recipe_title: string;
  ingredient_name: string;
  amount: number | null;
  unit: string;
  checked: boolean;
  added_at: string; // ISO 8601
  manual?: boolean;
  /** Last local mutation (LWW timestamp for cloud sync). Missing on pre-sync items. */
  updated_at?: string;
  /** Deletion tombstone — hidden from all views, kept until the next sync. */
  deleted_at?: string | null;
}

export const STORAGE_KEY = "rezept-app:shopping-list";
export const HIDE_CHECKED_KEY = "rezept-app:shopping-list:hide-checked";
export const SORT_MODE_KEY = "rezept-app:shopping-list:sort-mode";

export type SortMode = "recipe" | "type";

// Cloud sync registers itself here so every mutation schedules a debounced
// push without this module importing the sync layer (no import cycle).
type MutationListener = () => void;
const mutationListeners = new Set<MutationListener>();

export function addShoppingListMutationListener(listener: MutationListener): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

function emitMutation(): void {
  mutationListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // listeners must never break a mutation
    }
  });
}

/** All stored items including deletion tombstones (sync layer only). */
export function getRawList(): ShoppingListItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ShoppingListItem[];
  } catch {
    return [];
  }
}

export function getList(): ShoppingListItem[] {
  return getRawList().filter((item) => !item.deleted_at);
}

export function saveList(items: ShoppingListItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage might be unavailable (e.g. private browsing quota exceeded)
  }
}

/** Overwrite local storage with the merged server state (sync layer only). */
export function replaceList(items: ShoppingListItem[]): void {
  saveList(items);
}

export function addRecipeItems(
  recipe: { id: string; title: string; servings: number | null },
  ingredients: Array<{ amount: number; unit: string; name: string }>,
  desiredServings: number
): number {
  const current = getRawList();
  const now = new Date().toISOString();
  const newItems: ShoppingListItem[] = ingredients.map((ing) => {
    // Amounts are stored per portion; total = amount * desired servings.
    const scaledAmount =
      ing.amount > 0
        ? Math.round(ing.amount * desiredServings * 10) / 10
        : null;

    return {
      id: crypto.randomUUID(),
      recipe_id: recipe.id,
      recipe_title: recipe.title,
      ingredient_name: ing.name,
      amount: scaledAmount,
      unit: ing.unit,
      checked: false,
      added_at: now,
      updated_at: now,
    };
  });

  saveList([...current, ...newItems]);
  emitMutation();
  return newItems.length;
}

export function toggleItem(id: string): void {
  const now = new Date().toISOString();
  saveList(
    getRawList().map((item) =>
      item.id === id && !item.deleted_at
        ? { ...item, checked: !item.checked, updated_at: now }
        : item
    )
  );
  emitMutation();
}

// Set the checked state for a set of ids in a single write. Used by merged
// "by type" rows, where one displayed row controls several stored items.
export function setItemsChecked(ids: string[], checked: boolean): void {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const now = new Date().toISOString();
  saveList(
    getRawList().map((item) =>
      set.has(item.id) && !item.deleted_at
        ? { ...item, checked, updated_at: now }
        : item
    )
  );
  emitMutation();
}

export function removeItem(id: string): void {
  const now = new Date().toISOString();
  // Tombstone instead of dropping the row, so the deletion propagates to
  // other devices on the next sync.
  saveList(
    getRawList().map((item) =>
      item.id === id ? { ...item, deleted_at: now, updated_at: now } : item
    )
  );
  emitMutation();
}

export function clearList(): void {
  const now = new Date().toISOString();
  saveList(
    getRawList().map((item) =>
      item.deleted_at ? item : { ...item, deleted_at: now, updated_at: now }
    )
  );
  emitMutation();
}

export function getUncheckedCount(): number {
  return getList().filter((item) => !item.checked).length;
}

export function addManualItem(text: string): void {
  const current = getRawList();
  const now = new Date().toISOString();
  const newItem: ShoppingListItem = {
    id: crypto.randomUUID(),
    recipe_id: "manual",
    recipe_title: "Manuell hinzugefügt",
    ingredient_name: text,
    amount: null,
    unit: "",
    checked: false,
    added_at: now,
    manual: true,
    updated_at: now,
  };
  saveList([...current, newItem]);
  emitMutation();
}

export function getHideChecked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(HIDE_CHECKED_KEY) === "true";
  } catch {
    return false;
  }
}

export function setHideChecked(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HIDE_CHECKED_KEY, String(value));
  } catch {
    // ignore
  }
}

export function getSortMode(): SortMode {
  if (typeof window === "undefined") return "recipe";
  try {
    return localStorage.getItem(SORT_MODE_KEY) === "type" ? "type" : "recipe";
  } catch {
    return "recipe";
  }
}

export function setSortMode(value: SortMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SORT_MODE_KEY, value);
  } catch {
    // ignore
  }
}

// Nudge same-tab listeners (e.g. the UserNav badge, which syncs on "focus") to
// re-read the list after a mutation. The native "storage" event only fires in
// OTHER tabs, so we dispatch "focus" for the current one.
export function notifyListChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("focus"));
  } catch {
    // ignore
  }
}
