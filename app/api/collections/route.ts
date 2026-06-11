import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Collection, CollectionWithCount } from "@/types/collection";

export const dynamic = "force-dynamic";

// Postgres "relation does not exist" — migration 20260611000004 not applied.
const RELATION_MISSING = "42P01";

const TABLE_MISSING_MESSAGE = "Sammlungen sind noch nicht eingerichtet.";
const DUPLICATE_NAME_MESSAGE = "Eine Sammlung mit diesem Namen existiert bereits.";
const INVALID_NAME_MESSAGE = "Der Name muss zwischen 1 und 100 Zeichen lang sein.";

type CollectionCountRow = Collection & {
  collection_recipes: { count: number }[] | null;
};

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("collections")
    .select("*, collection_recipes(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === RELATION_MISSING) {
      return NextResponse.json({ data: null, error: TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const collections: CollectionWithCount[] = ((data ?? []) as CollectionCountRow[]).map(
    ({ collection_recipes, ...rest }) => ({
      ...rest,
      recipe_count: collection_recipes?.[0]?.count ?? 0,
    })
  );

  const recipeId = request.nextUrl.searchParams.get("recipe_id");
  if (!recipeId) {
    return NextResponse.json({ data: collections, error: null });
  }

  // Picker mode: flag for each collection whether it already contains the
  // recipe — one membership query over the user's collection ids.
  let memberIds = new Set<string>();
  if (collections.length > 0) {
    const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("collection_recipes")
      .select("collection_id")
      .eq("recipe_id", recipeId)
      .in(
        "collection_id",
        collections.map((collection) => collection.id)
      );

    if (membershipError) {
      return NextResponse.json(
        { data: null, error: membershipError.message },
        { status: 500 }
      );
    }
    memberIds = new Set(
      ((memberships ?? []) as { collection_id: string }[]).map((m) => m.collection_id)
    );
  }

  return NextResponse.json({
    data: collections.map((collection) => ({
      ...collection,
      contains_recipe: memberIds.has(collection.id),
    })),
    error: null,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (name.length < 1 || name.length > 100) {
    return NextResponse.json({ data: null, error: INVALID_NAME_MESSAGE }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("collections")
    .insert({ user_id: user.id, name })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ data: null, error: DUPLICATE_NAME_MESSAGE }, { status: 409 });
    }
    if (error.code === RELATION_MISSING) {
      return NextResponse.json({ data: null, error: TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null }, { status: 201 });
}
