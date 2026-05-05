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
    const scaledAmount =
      ing.amount > 0 && recipe.servings != null && recipe.servings > 0
        ? Math.round((ing.amount * desiredServings) / recipe.servings * 10) / 10
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
