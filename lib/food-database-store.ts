// Server-side access to the SHARED, cross-user food nutrition cache
// (food_database). Used only by app/api/nutrition/food-lookup via the
// service-role client, so that a Claude lookup by any one user is persisted for
// everyone and never repeated. Keys are NORMALIZED food names
// (see normalizeIngredientName in lib/ingredient-categories.ts).
//
// All reads/writes are best-effort: if the table is missing (migration not yet
// applied, Postgres 42P01) the helpers degrade quietly and the route falls back
// to a fresh Claude lookup.

import { supabaseAdmin } from "@/lib/supabase";

const TABLE = "food_database";
const RELATION_MISSING = "42P01";

export interface FoodDatabaseRow {
  name: string;
  display_name: string;
  kcal_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_desc: string | null;
  source: "seed" | "llm";
}

const COLUMNS =
  "name, display_name, kcal_per_serving, protein_g, carbs_g, fat_g, serving_desc, source";

/** Fetch one cached food by its normalized name. null = miss or table missing. */
export async function getFoodByName(norm: string): Promise<FoodDatabaseRow | null> {
  if (!norm) return null;
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(COLUMNS)
    .eq("name", norm)
    .maybeSingle();

  if (error) {
    if (error.code !== RELATION_MISSING) {
      console.warn("[food-database-store] read failed:", error.message);
    }
    return null;
  }
  return (data as FoodDatabaseRow | null) ?? null;
}

/** Upsert one LLM-learned food (keyed by normalized name) for all users. */
export async function saveFood(row: FoodDatabaseRow): Promise<void> {
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "name" });

  if (error && error.code !== RELATION_MISSING) {
    console.warn("[food-database-store] write failed:", error.message);
  }
}
