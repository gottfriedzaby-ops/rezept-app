// Feature 20 — analytics event taxonomy.
//
// Framework-agnostic (no React, no "use client"): imported by both the client
// capture library (lib/analytics-client.ts) and the server ingestion route
// (app/api/events/route.ts). The per-event property map gives type-safe
// instrumentation with no `any`, and doubles as the server-side whitelist.
//
// PRIVACY INVARIANT: property values MUST be primitive (string | number |
// boolean) and free of personal content. NEVER add a property that can carry
// free text (search queries, pantry text, questions), recipe titles, notes,
// ingredient names, URLs, tokens, emails or display names. `recipe_id` (a
// non-identifying uuid) is allowed; the title is not.

import type { RecipeType, SourceType } from "@/types/recipe";

// Import sources are a subset of SourceType (a "manual" recipe is not imported).
export type ImportSource = "url" | "youtube" | "photo" | "instagram" | "pdf";

export type AnalyticsEventCategory =
  | "navigation"
  | "import"
  | "recipe"
  | "search"
  | "engagement"
  | "cooking"
  | "planning"
  | "assistant"
  | "shopping";

// Property shapes per event. Empty events use Record<string, never> so the
// `track` call needs no second argument.
export interface AnalyticsEventPropertyMap {
  page_view: Record<string, never>;
  recipe_import_started: { source: ImportSource };
  recipe_import_review: { source: ImportSource };
  recipe_imported: { source: ImportSource; recipe_type?: RecipeType };
  recipe_import_failed: { source: ImportSource; stage?: string };
  recipe_import_duplicate: { source: ImportSource };
  recipe_viewed: {
    recipe_id: string;
    source_type?: SourceType;
    recipe_type?: RecipeType;
    is_owner: boolean;
  };
  // NEVER the query text — length + result count only.
  recipe_search: {
    result_count: number;
    has_tag_filter: boolean;
    favorites_only: boolean;
    sort?: string;
  };
  favorite_toggled: { favorited: boolean; surface: "list" | "detail" };
  recipe_rated: { rating: number | null };
  cook_started: {
    recipe_id: string;
    recipe_type?: RecipeType;
    step_count: number;
    has_timer: boolean;
    servings: number;
  };
  cook_completed: {
    recipe_id: string;
    recipe_type?: RecipeType;
    step_count: number;
  };
  meal_plan_added: { meal_slot: string; source: "manual" | "suggestion" };
  meal_plan_week_suggested: { suggestion_count: number };
  meal_plan_suggestions_applied: { applied_count: number };
  // NEVER the question/pantry text — a coarse kind + bucketed size only.
  assistant_query: {
    kind: "pantry" | "week_plan" | "cooking_question" | "collections";
    result_count?: number;
    pantry_length_bucket?: "<20" | "20-60" | ">60";
  };
  shopping_items_added: {
    item_count: number;
    source: "recipe" | "week" | "assistant" | "manual";
  };
}

export type AnalyticsEventName = keyof AnalyticsEventPropertyMap;

// Single source of truth for the category dimension. The server stamps this,
// ignoring any client-supplied category, so the value can never be spoofed.
export const EVENT_CATEGORY: Record<AnalyticsEventName, AnalyticsEventCategory> = {
  page_view: "navigation",
  recipe_import_started: "import",
  recipe_import_review: "import",
  recipe_imported: "import",
  recipe_import_failed: "import",
  recipe_import_duplicate: "import",
  recipe_viewed: "recipe",
  recipe_search: "search",
  favorite_toggled: "engagement",
  recipe_rated: "engagement",
  cook_started: "cooking",
  cook_completed: "cooking",
  meal_plan_added: "planning",
  meal_plan_week_suggested: "planning",
  meal_plan_suggestions_applied: "planning",
  assistant_query: "assistant",
  shopping_items_added: "shopping",
};

// Server-side whitelist derived from the taxonomy.
const EVENT_NAME_SET = new Set<string>(Object.keys(EVENT_CATEGORY));

export function isAnalyticsEventName(name: unknown): name is AnalyticsEventName {
  return typeof name === "string" && EVENT_NAME_SET.has(name);
}

// Consent default. Must stay in sync with the user_settings.analytics_enabled
// column DEFAULT and the settings-route null fallback. `true` = opt-out model.
export const ANALYTICS_DEFAULT_ENABLED = true;

// Argument tuple for `track`: events with empty props take no second argument.
export type PropsArg<K extends AnalyticsEventName> =
  AnalyticsEventPropertyMap[K] extends Record<string, never>
    ? []
    : [properties: AnalyticsEventPropertyMap[K]];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Locale segments are stripped from the front of a path when normalising.
const LOCALE_SEGMENTS = new Set(["de", "en", "nl"]);

// Reduce a concrete pathname to a low-cardinality, non-identifying route
// template: strip the locale prefix, replace uuid/long-token segments with
// placeholders. e.g. "/de/1f0c…/cook" -> "/[id]/cook", "/de/meal-plan" ->
// "/meal-plan", "/de" -> "/". Keeps the `path` dimension safe to store + group.
export function normalizeRoute(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0];
  const segments = clean.split("/").filter(Boolean);
  if (segments.length > 0 && LOCALE_SEGMENTS.has(segments[0])) {
    segments.shift();
  }
  const mapped = segments.map((seg) => {
    if (UUID_RE.test(seg)) return "[id]";
    // Share tokens and other opaque ids: long alphanumeric segments.
    if (seg.length >= 20 && /^[A-Za-z0-9_-]+$/.test(seg)) return "[token]";
    return seg;
  });
  return "/" + mapped.join("/");
}
