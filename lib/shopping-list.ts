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
}

export const STORAGE_KEY = "rezept-app:shopping-list";
export const HIDE_CHECKED_KEY = "rezept-app:shopping-list:hide-checked";
export const SORT_MODE_KEY = "rezept-app:shopping-list:sort-mode";

export type SortMode = "recipe" | "type";

export function getList(): ShoppingListItem[] {
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

export function saveList(items: ShoppingListItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage might be unavailable (e.g. private browsing quota exceeded)
  }
}

export function addRecipeItems(
  recipe: { id: string; title: string; servings: number | null },
  ingredients: Array<{ amount: number; unit: string; name: string }>,
  desiredServings: number
): number {
  const current = getList();
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
      added_at: new Date().toISOString(),
    };
  });

  saveList([...current, ...newItems]);
  return newItems.length;
}

export function toggleItem(id: string): void {
  const items = getList();
  saveList(items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)));
}

// Set the checked state for a set of ids in a single write. Used by merged
// "by type" rows, where one displayed row controls several stored items.
export function setItemsChecked(ids: string[], checked: boolean): void {
  if (ids.length === 0) return;
  const set = new Set(ids);
  saveList(getList().map((item) => (set.has(item.id) ? { ...item, checked } : item)));
}

export function removeItem(id: string): void {
  saveList(getList().filter((item) => item.id !== id));
}

export function clearList(): void {
  saveList([]);
}

export function getUncheckedCount(): number {
  return getList().filter((item) => !item.checked).length;
}

export function addManualItem(text: string): void {
  const current = getList();
  const newItem: ShoppingListItem = {
    id: crypto.randomUUID(),
    recipe_id: "manual",
    recipe_title: "Manuell hinzugefügt",
    ingredient_name: text,
    amount: null,
    unit: "",
    checked: false,
    added_at: new Date().toISOString(),
    manual: true,
  };
  saveList([...current, newItem]);
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
