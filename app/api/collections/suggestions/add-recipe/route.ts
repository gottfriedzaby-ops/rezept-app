import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isSmartCollectionKey,
  smartCategoryName,
  type SuggestionLocale,
} from "@/lib/collection-suggestions";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const TABLE_MISSING_MESSAGE = "Sammlungen sind noch nicht eingerichtet.";

function resolveLocale(value: unknown): SuggestionLocale {
  return value === "en" || value === "nl" ? value : "de";
}

/**
 * Post-Import-Schnellaktion: legt die kanonische Sammlung an (oder findet sie)
 * und fügt EIN Rezept hinzu. `{ key, recipe_id, locale }`.
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
  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id : "";
  if (!isSmartCollectionKey(body.key) || !recipeId) {
    return NextResponse.json({ data: null, error: "Ungültige Anfrage." }, { status: 400 });
  }
  const name = smartCategoryName(body.key, resolveLocale(body.locale));

  // Nur eigene Rezepte dürfen gesammelt werden.
  const { data: recipe, error: recipeError } = await supabaseAdmin
    .from("recipes")
    .select("id, user_id")
    .eq("id", recipeId)
    .maybeSingle();
  if (recipeError || !recipe) {
    return NextResponse.json({ data: null, error: "Rezept nicht gefunden" }, { status: 404 });
  }
  if (recipe.user_id !== user.id) {
    return NextResponse.json({ data: null, error: "Keine Berechtigung" }, { status: 403 });
  }

  // Find-or-create: bestehende Sammlung mit diesem Namen wiederverwenden.
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("collections")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .maybeSingle();
  if (lookupError && lookupError.code === RELATION_MISSING) {
    return NextResponse.json({ data: null, error: TABLE_MISSING_MESSAGE }, { status: 503 });
  }

  let collectionId = existing?.id as string | undefined;
  if (!collectionId) {
    const { data: created, error: createError } = await supabaseAdmin
      .from("collections")
      .insert({ user_id: user.id, name })
      .select("id")
      .single();
    if (createError) {
      // Race: parallele Erstellung → erneut suchen.
      if (createError.code === "23505") {
        const { data: retry } = await supabaseAdmin
          .from("collections")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", name)
          .maybeSingle();
        collectionId = retry?.id as string | undefined;
      } else if (createError.code === RELATION_MISSING) {
        return NextResponse.json({ data: null, error: TABLE_MISSING_MESSAGE }, { status: 503 });
      } else {
        return NextResponse.json({ data: null, error: createError.message }, { status: 500 });
      }
    } else {
      collectionId = created.id;
    }
  }

  if (!collectionId) {
    return NextResponse.json({ data: null, error: "Sammlung nicht gefunden" }, { status: 500 });
  }

  const { error: membershipError } = await supabaseAdmin
    .from("collection_recipes")
    .insert({ collection_id: collectionId, recipe_id: recipeId });

  // Duplikat = idempotenter Erfolg.
  if (membershipError && membershipError.code !== "23505") {
    return NextResponse.json({ data: null, error: membershipError.message }, { status: 500 });
  }

  return NextResponse.json(
    { data: { collection_id: collectionId, recipe_id: recipeId }, error: null },
    { status: 201 }
  );
}
