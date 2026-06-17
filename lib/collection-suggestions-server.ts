import { supabaseAdmin } from "@/lib/supabase";
import type { RecipeType } from "@/types/recipe";
import {
  computeCollectionSuggestions,
  iconKeyForCollectionName,
  isSmartCollectionKey,
  type CollectionSuggestion,
  type SmartCollectionKey,
  type SuggestionRecipeInput,
} from "@/lib/collection-suggestions";

const RELATION_MISSING = "42P01";

interface RecipeRow {
  id: string;
  title: string;
  recipe_type: RecipeType | null;
  tags: string[] | null;
}

/**
 * Lädt die Daten eines Nutzers (eigene Rezepte, bestehende Sammlungsnamen,
 * verworfene Vorschläge) und berechnet daraus die Smart-Collection-Vorschläge.
 *
 * Degradiert graceful: fehlt eine Tabelle (42P01) oder schlägt eine Query fehl,
 * wird der jeweilige Teil als leer behandelt — Vorschläge bleiben eine weiche
 * Zusatzfunktion und stürzen die aufrufende Seite nie ab (vgl. `lib/collections.ts`).
 *
 * Wiederverwendet von der Sammlungs-Seite, der Startseite und der GET-Route.
 */
/** Lädt die Rezepte eines Nutzers in der Matcher-Projektion (oder `null` bei Fehler). */
export async function fetchUserSuggestionRecipes(
  userId: string
): Promise<SuggestionRecipeInput[] | null> {
  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id, title, recipe_type, tags")
    .eq("user_id", userId)
    .limit(1000)
    .returns<RecipeRow[]>();

  if (error) {
    console.error("[collection-suggestions] recipes query failed:", error.message);
    return null;
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
    recipe_type: row.recipe_type ?? "kochen",
    tags: row.tags ?? [],
  }));
}

export async function getCollectionSuggestionsForUser(
  userId: string
): Promise<CollectionSuggestion[]> {
  const recipes = await fetchUserSuggestionRecipes(userId);
  if (!recipes || recipes.length === 0) return [];

  // Bestehende Sammlungen → bereits abgedeckte Kategorien.
  const coveredKeys = new Set<SmartCollectionKey>();
  const { data: collectionRows, error: collectionError } = await supabaseAdmin
    .from("collections")
    .select("name")
    .eq("user_id", userId);

  if (collectionError && collectionError.code !== RELATION_MISSING) {
    console.warn("[collection-suggestions] collections query failed:", collectionError.message);
  }
  for (const row of (collectionRows ?? []) as { name: string }[]) {
    const key = iconKeyForCollectionName(row.name);
    if (key) coveredKeys.add(key);
  }

  // Verworfene Vorschläge.
  const dismissedKeys = new Set<SmartCollectionKey>();
  const { data: dismissalRows, error: dismissalError } = await supabaseAdmin
    .from("collection_suggestion_dismissals")
    .select("category_key")
    .eq("user_id", userId);

  if (dismissalError && dismissalError.code !== RELATION_MISSING) {
    console.warn("[collection-suggestions] dismissals query failed:", dismissalError.message);
  }
  for (const row of (dismissalRows ?? []) as { category_key: string }[]) {
    if (isSmartCollectionKey(row.category_key)) dismissedKeys.add(row.category_key);
  }

  return computeCollectionSuggestions({ recipes, coveredKeys, dismissedKeys });
}
