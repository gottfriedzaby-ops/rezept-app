import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchUserSuggestionRecipes } from "@/lib/collection-suggestions-server";
import {
  categorizeRecipe,
  isSmartCollectionKey,
  smartCategoryName,
  type SuggestionLocale,
} from "@/lib/collection-suggestions";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const TABLE_MISSING_MESSAGE = "Sammlungen sind noch nicht eingerichtet.";
const DUPLICATE_NAME_MESSAGE = "Eine Sammlung mit diesem Namen existiert bereits.";
const INVALID_MESSAGE = "Ungültige Anfrage.";

function resolveLocale(value: unknown): SuggestionLocale {
  return value === "en" || value === "nl" ? value : "de";
}

/**
 * Wendet einen Vorschlag an: legt die Sammlung an und fügt alle passenden
 * Rezepte in einem Rutsch hinzu. Akzeptiert ENTWEDER `{ key, locale }`
 * (kanonisch: Treffer werden serverseitig neu berechnet) ODER
 * `{ name, recipe_ids }` (KI/eigen: IDs werden gegen die eigenen Rezepte geprüft).
 */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  let name: string;
  let recipeIds: string[];

  if (typeof body.key === "string") {
    if (!isSmartCollectionKey(body.key)) {
      return NextResponse.json({ data: null, error: INVALID_MESSAGE }, { status: 400 });
    }
    name = smartCategoryName(body.key, resolveLocale(body.locale));
    const recipes = await fetchUserSuggestionRecipes(user.id);
    if (!recipes) {
      return NextResponse.json({ data: null, error: "Rezepte konnten nicht geladen werden." }, { status: 500 });
    }
    recipeIds = recipes
      .filter((recipe) => categorizeRecipe(recipe).includes(body.key))
      .map((recipe) => recipe.id);
  } else {
    name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 100) {
      return NextResponse.json({ data: null, error: INVALID_MESSAGE }, { status: 400 });
    }
    const requestedIds: string[] = Array.isArray(body.recipe_ids)
      ? body.recipe_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    if (requestedIds.length === 0) {
      return NextResponse.json({ data: null, error: INVALID_MESSAGE }, { status: 400 });
    }
    // Nur eigene Rezepte dürfen in die Sammlung — IDs gegen die Bibliothek prüfen.
    const { data: owned, error: ownedError } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .eq("user_id", user.id)
      .in("id", requestedIds);
    if (ownedError) {
      return NextResponse.json({ data: null, error: ownedError.message }, { status: 500 });
    }
    recipeIds = ((owned ?? []) as { id: string }[]).map((row) => row.id);
  }

  // Sammlung anlegen.
  const { data: collection, error: createError } = await supabaseAdmin
    .from("collections")
    .insert({ user_id: user.id, name })
    .select()
    .single();

  if (createError) {
    if (createError.code === "23505") {
      return NextResponse.json({ data: null, error: DUPLICATE_NAME_MESSAGE }, { status: 409 });
    }
    if (createError.code === RELATION_MISSING) {
      return NextResponse.json({ data: null, error: TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ data: null, error: createError.message }, { status: 500 });
  }

  // Mitgliedschaften in einem Multi-Row-Insert. Ownership ist durch die obige
  // Filterung garantiert, daher keine Per-Zeilen-Prüfung nötig.
  let addedCount = 0;
  if (recipeIds.length > 0) {
    const { error: membershipError } = await supabaseAdmin
      .from("collection_recipes")
      .insert(recipeIds.map((recipeId) => ({ collection_id: collection.id, recipe_id: recipeId })));
    if (membershipError) {
      return NextResponse.json({ data: null, error: membershipError.message }, { status: 500 });
    }
    addedCount = recipeIds.length;
  }

  return NextResponse.json({ data: { collection, addedCount }, error: null }, { status: 201 });
}
