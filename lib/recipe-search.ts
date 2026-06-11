import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";

// Server-side recipe search with the exact semantics of the previous
// client-side filter: whole query as case-insensitive substring over
// title + tags + ingredient names (search_text column), AND-combined tag
// filters, favorites restricted to own recipes.

export type RecipeSort = "newest" | "az" | "time" | "rating";

export interface RecipeSearchParams {
  q?: string;
  tags?: string[];
  favoritesOnly?: boolean;
  sort?: RecipeSort;
  offset?: number;
  limit?: number;
}

export interface RecipeSearchResult {
  recipes: Recipe[];
  total: number;
  offset: number;
  limit: number;
}

export const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

// Postgres error code for "column does not exist" — the search migration
// (20260611000002_recipe_search.sql) has not been applied yet.
const UNDEFINED_COLUMN = "42703";

let warnedMissingColumns = false;

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function parseSort(value: string | null | undefined): RecipeSort {
  return value === "az" || value === "time" || value === "rating" ? value : "newest";
}

function buildQuery(
  userId: string,
  sharedOwnerIds: string[],
  params: RecipeSearchParams,
  opts: { degraded: boolean }
) {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const offset = Math.max(params.offset ?? 0, 0);

  let query = supabaseAdmin.from("recipes").select("*", { count: "exact" });

  // Visibility: favorites are a per-owner flag, so the favorites filter is
  // restricted to the user's own recipes (matches the old client behaviour).
  if (params.favoritesOnly) {
    query = query.eq("user_id", userId).eq("favorite", true);
  } else if (sharedOwnerIds.length > 0) {
    query = query.or(
      `user_id.eq.${userId},and(user_id.in.(${sharedOwnerIds.join(",")}),is_private.eq.false)`
    );
  } else {
    query = query.eq("user_id", userId);
  }

  const q = params.q?.trim().toLowerCase();
  if (q) {
    const pattern = `%${escapeIlike(q)}%`;
    // Degraded mode (migration unapplied): search the title only.
    query = opts.degraded
      ? query.ilike("title", pattern)
      : query.ilike("search_text", pattern);
  }

  if (params.tags && params.tags.length > 0) {
    query = query.contains("tags", params.tags);
  }

  const sort = params.sort ?? "newest";
  if (sort === "az") {
    query = query.order("title", { ascending: true });
  } else if (sort === "time" && !opts.degraded) {
    query = query
      .order("total_time", { ascending: true })
      .order("created_at", { ascending: false });
  } else if (sort === "rating" && !opts.degraded) {
    query = query
      .order("rating", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  return { query: query.range(offset, offset + limit - 1), limit, offset };
}

export async function searchRecipes(
  userId: string,
  sharedOwnerIds: string[],
  params: RecipeSearchParams
): Promise<RecipeSearchResult> {
  const first = buildQuery(userId, sharedOwnerIds, params, { degraded: false });
  let { data, error, count } = await first.query.returns<Recipe[]>();

  if (error && error.code === UNDEFINED_COLUMN) {
    if (!warnedMissingColumns) {
      warnedMissingColumns = true;
      console.warn(
        "[recipe-search] search_text/total_time fehlen — Migration 20260611000002_recipe_search.sql ausführen. Fallback auf Titel-Suche."
      );
    }
    const retry = buildQuery(userId, sharedOwnerIds, params, { degraded: true });
    ({ data, error, count } = await retry.query.returns<Recipe[]>());
  }

  if (error) {
    throw new Error(error.message);
  }

  return {
    recipes: data ?? [],
    total: count ?? data?.length ?? 0,
    offset: first.offset,
    limit: first.limit,
  };
}

/**
 * Owner ids whose accepted library shares are visible to this user in the
 * unified list (empty when the user disabled the unified view).
 */
export async function getSharedOwnerIds(userId: string): Promise<string[]> {
  const [{ data: shares }, { data: settings }] = await Promise.all([
    supabaseAdmin
      .from("library_shares")
      .select("owner_id")
      .eq("recipient_id", userId)
      .eq("status", "accepted"),
    supabaseAdmin
      .from("user_settings")
      .select("show_shared_in_main_library")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const showShared = settings?.show_shared_in_main_library ?? true;
  if (!showShared) return [];
  return (shares ?? []).map((s) => s.owner_id as string);
}

/**
 * All tags visible to the user (own + shared), ranked by frequency
 * (German-locale alphabetical tiebreaker). Powers the filter bar without
 * loading every recipe row.
 */
export async function getVisibleTags(
  userId: string,
  sharedOwnerIds: string[]
): Promise<string[]> {
  let query = supabaseAdmin.from("recipes").select("tags");
  if (sharedOwnerIds.length > 0) {
    query = query.or(
      `user_id.eq.${userId},and(user_id.in.(${sharedOwnerIds.join(",")}),is_private.eq.false)`
    );
  } else {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const counts = new Map<string, number>();
  for (const row of data as Array<{ tags: string[] | null }>) {
    for (const tag of row.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort(([a, ca], [b, cb]) => (cb !== ca ? cb - ca : a.localeCompare(b, "de")))
    .map(([tag]) => tag);
}
