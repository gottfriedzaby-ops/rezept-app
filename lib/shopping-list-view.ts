// Pure, display-time grouping + merging for the shopping list. No localStorage
// access — it transforms the raw stored items into render-ready groups/rows and
// is consumed by BOTH the list page and Shopping Mode (so the two stay visually
// consistent and share one source of truth). Unit-tested in the node project.

import type { ShoppingListItem, SortMode } from "@/lib/shopping-list";
import {
  resolveCategory,
  normalizeIngredientName,
  CATEGORIES,
  type CategoryId,
} from "@/lib/ingredient-categories";

export type { SortMode };

// One rendered line. In "recipe" mode each row wraps exactly one item
// (ids.length === 1). In "type" mode rows may merge several items.
export interface ViewRow {
  key: string; // stable React key
  ids: string[]; // underlying item ids this row controls
  displayName: string; // ingredient_name (original casing of first contributor)
  amount: number | null; // summed amount, or null
  unit: string; // shared unit ("" allowed)
  checked: boolean; // true ONLY when ALL contributors are checked
  sourceCount: number; // distinct recipe sources (for the "aus N Rezepten" hint)
  manual: boolean; // true if any contributor is a manual entry
}

export interface ViewGroup {
  kind: "recipe" | "category";
  id: string; // recipe_title OR CategoryId
  rows: ViewRow[];
  total: number; // number of rows in the group
  checkedCount: number; // checked rows in the group
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "200 g Mehl" / "Salz" — integer floats render without a trailing ".0". */
export function formatRowAmount(amount: number | null, unit: string, name: string): string {
  const parts: string[] = [];
  if (amount != null) {
    parts.push(Number.isInteger(amount) ? String(amount) : amount.toFixed(1));
  }
  if (unit) parts.push(unit);
  parts.push(name);
  return parts.join(" ");
}

/** Items merge only when both the normalized name AND the unit match. */
export function mergeKey(item: ShoppingListItem): string {
  return `${normalizeIngredientName(item.ingredient_name)}__${item.unit.trim().toLowerCase()}`;
}

function summarize(rows: ViewRow[]): { total: number; checkedCount: number } {
  return { total: rows.length, checkedCount: rows.filter((r) => r.checked).length };
}

// "By recipe": one row per item, no merging; recipes in first-seen order.
export function buildRecipeGroups(items: ShoppingListItem[]): ViewGroup[] {
  const order: string[] = [];
  const map: Record<string, ViewRow[]> = {};

  for (const item of items) {
    if (!map[item.recipe_title]) {
      order.push(item.recipe_title);
      map[item.recipe_title] = [];
    }
    map[item.recipe_title].push({
      key: item.id,
      ids: [item.id],
      displayName: item.ingredient_name,
      amount: item.amount,
      unit: item.unit,
      checked: item.checked,
      sourceCount: 1,
      manual: !!item.manual,
    });
  }

  return order.map((title) => ({
    kind: "recipe" as const,
    id: title,
    rows: map[title],
    ...summarize(map[title]),
  }));
}

// "By type": bucket by aisle, merge same name+unit within an aisle.
export function buildTypeGroups(
  items: ShoppingListItem[],
  learned: Record<string, CategoryId>
): ViewGroup[] {
  // category id -> (mergeKey -> contributing items)
  const byCategory: Record<string, Map<string, ShoppingListItem[]>> = {};

  for (const item of items) {
    const cat = resolveCategory(item.ingredient_name, learned, item.manual);
    const groups = (byCategory[cat] ??= new Map());
    const key = mergeKey(item);
    const members = groups.get(key);
    if (members) members.push(item);
    else groups.set(key, [item]);
  }

  const result: ViewGroup[] = [];
  // Iterate in the fixed aisle order; skip empty categories.
  for (const meta of CATEGORIES) {
    const groups = byCategory[meta.id];
    if (!groups) continue;

    const rows: ViewRow[] = [];
    groups.forEach((members, key) => {
      const numeric = members
        .map((m) => m.amount)
        .filter((a): a is number => a != null);
      const amount = numeric.length > 0 ? round1(numeric.reduce((a, b) => a + b, 0)) : null;
      const sources = new Set(members.map((m) => m.recipe_id));

      rows.push({
        key: `${meta.id}:${key}`,
        ids: members.map((m) => m.id),
        displayName: members[0].ingredient_name,
        amount,
        unit: members[0].unit,
        checked: members.every((m) => m.checked),
        sourceCount: sources.size,
        manual: members.some((m) => m.manual),
      });
    });

    rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "de", { sensitivity: "base" }));
    result.push({ kind: "category", id: meta.id, rows, ...summarize(rows) });
  }

  return result;
}

export function buildGroups(
  items: ShoppingListItem[],
  mode: SortMode,
  learned: Record<string, CategoryId>
): ViewGroup[] {
  return mode === "type" ? buildTypeGroups(items, learned) : buildRecipeGroups(items);
}
