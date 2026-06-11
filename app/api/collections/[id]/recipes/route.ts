import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Returns the authenticated user or null (caller sends the 401). */
async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Verifies that the collection exists and belongs to the user. */
async function ownsCollection(collectionId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && data !== null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id : "";
  if (!recipeId) {
    return NextResponse.json({ data: null, error: "recipe_id ist erforderlich." }, { status: 400 });
  }

  if (!(await ownsCollection(params.id, user.id))) {
    return NextResponse.json({ data: null, error: "Sammlung nicht gefunden" }, { status: 404 });
  }

  // Only own recipes can be collected.
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

  const { error } = await supabaseAdmin
    .from("collection_recipes")
    .insert({ collection_id: params.id, recipe_id: recipeId });

  if (error) {
    if (error.code === "23505") {
      // Already in the collection — treat as idempotent success.
      return NextResponse.json({
        data: { collection_id: params.id, recipe_id: recipeId },
        error: null,
      });
    }
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { data: { collection_id: params.id, recipe_id: recipeId }, error: null },
    { status: 201 }
  );
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const recipeId = typeof body.recipe_id === "string" ? body.recipe_id : "";
  if (!recipeId) {
    return NextResponse.json({ data: null, error: "recipe_id ist erforderlich." }, { status: 400 });
  }

  if (!(await ownsCollection(params.id, user.id))) {
    return NextResponse.json({ data: null, error: "Sammlung nicht gefunden" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("collection_recipes")
    .delete()
    .eq("collection_id", params.id)
    .eq("recipe_id", recipeId);

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  // 200 even when the recipe was not in the collection — removal is idempotent.
  return NextResponse.json({ data: null, error: null });
}
