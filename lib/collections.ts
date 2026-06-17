import { supabaseAdmin } from "@/lib/supabase";
import type { Collection, CollectionWithCount } from "@/types/collection";

type CollectionCountRow = Collection & {
  collection_recipes: { count: number }[] | null;
};

/**
 * Lädt alle Sammlungen eines Nutzers inkl. Rezeptanzahl, neueste zuerst.
 *
 * Degradiert graceful zu `[]`, wenn die Tabelle noch fehlt (42P01) — die
 * Discovery-Migration (20260611000004_feature17_discovery.sql) ist dann noch
 * nicht eingespielt. Andere Fehler werden geloggt und ebenfalls als `[]`
 * behandelt, damit aufrufende Seiten nicht abstürzen.
 */
export async function getCollectionsWithCounts(
  userId: string
): Promise<CollectionWithCount[]> {
  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("*, collection_recipes(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") {
      console.warn(
        "[collections] Tabelle 'collections' fehlt — Migration 20260611000004_feature17_discovery.sql ausführen."
      );
    } else {
      console.error("[collections] query failed:", error.message);
    }
    return [];
  }

  return ((data ?? []) as CollectionCountRow[]).map(
    ({ collection_recipes, ...rest }) => ({
      ...rest,
      recipe_count: collection_recipes?.[0]?.count ?? 0,
    })
  );
}
