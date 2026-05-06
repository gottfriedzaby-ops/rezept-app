import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .single();

  const recipe = data as Recipe | null;
  if (!recipe) return NextResponse.json({ data: null, error: "Rezept nicht gefunden." }, { status: 404 });

  // Verify access: owner OR accepted library share recipient (non-private recipes only)
  const isOwner = recipe.user_id === user.id;
  if (!isOwner) {
    if (recipe.is_private) {
      return NextResponse.json({ data: null, error: "Kein Zugriff." }, { status: 403 });
    }
    const { data: share } = await supabaseAdmin
      .from("library_shares")
      .select("id")
      .eq("owner_id", recipe.user_id)
      .eq("recipient_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();

    if (!share) return NextResponse.json({ data: null, error: "Kein Zugriff." }, { status: 403 });
  }

  // Build owner attribution for source_title
  let ownerSuffix = "";
  if (!isOwner) {
    const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(recipe.user_id!);
    const ownerName =
      (ownerData.user?.user_metadata?.full_name as string) ||
      ownerData.user?.email ||
      "unbekannt";
    ownerSuffix = ` (kopiert aus Sammlung von ${ownerName})`;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created_at, updated_at, user_id, favorite, is_private, source_title, ...rest } =
    recipe as Recipe & { user_id: string; created_at: string; updated_at: string };

  const { data: newRecipe, error } = await supabaseAdmin
    .from("recipes")
    .insert({
      ...rest,
      user_id: user.id,
      favorite: false,
      is_private: false,
      source_title: (source_title ?? "") + ownerSuffix || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  return NextResponse.json({ data: { id: newRecipe.id }, error: null }, { status: 201 });
}
