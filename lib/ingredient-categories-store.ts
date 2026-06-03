// Server-side access to the SHARED, cross-user learned-category table
// (ingredient_categories). Used only by app/api/shopping/categorize via the
// service-role client, so that a Claude lookup by any one user is persisted for
// everyone and never repeated. Keys are NORMALIZED ingredient names
// (see normalizeIngredientName in lib/ingredient-categories.ts).
//
// All reads/writes are best-effort: if the table is missing (migration not yet
// applied) the helpers degrade quietly and the route falls back to a fresh
// Claude lookup.

import { supabaseAdmin } from "@/lib/supabase";
import { isCategoryId, type CategoryId } from "@/lib/ingredient-categories";

const TABLE = "ingredient_categories";

interface CategoryRow {
  name: string;
  category: string;
}

/** Fetch shared categories for the given normalized names. */
export async function getSharedCategories(
  normalizedNames: string[]
): Promise<Record<string, CategoryId>> {
  if (normalizedNames.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("name, category")
    .in("name", normalizedNames);

  if (error || !data) return {};

  const out: Record<string, CategoryId> = {};
  for (const row of data as CategoryRow[]) {
    if (isCategoryId(row.category)) out[row.name] = row.category;
  }
  return out;
}

/** Upsert newly-learned categories (keyed by normalized name) for all users. */
export async function saveSharedCategories(
  map: Record<string, CategoryId>
): Promise<void> {
  const now = new Date().toISOString();
  const rows = Object.entries(map).map(([name, category]) => ({
    name,
    category,
    updated_at: now,
  }));
  if (rows.length === 0) return;

  await supabaseAdmin.from(TABLE).upsert(rows, { onConflict: "name" });
}
