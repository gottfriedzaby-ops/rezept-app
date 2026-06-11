import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// Marks a recipe as cooked (CookMode "Fertig"). Increments the counter and
// stamps last_cooked_at — feeds the discovery surfaces and the assistant's
// week suggestions. Best-effort: clients fire-and-forget.
export async function POST(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: recipe, error: fetchError } = await supabaseAdmin
    .from("recipes")
    .select("id, cooked_count")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) {
    // 42703: discovery migration not applied yet — silently a no-op.
    if (fetchError.code === "42703") {
      return NextResponse.json({ data: null, error: null });
    }
    return NextResponse.json({ data: null, error: fetchError.message }, { status: 500 });
  }
  if (!recipe) {
    return NextResponse.json({ data: null, error: "Rezept nicht gefunden" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("recipes")
    .update({
      cooked_count: (recipe.cooked_count ?? 0) + 1,
      last_cooked_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, cooked_count, last_cooked_at")
    .single();

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null });
}
