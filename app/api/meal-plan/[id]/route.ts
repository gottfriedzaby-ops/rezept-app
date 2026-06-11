import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const servings: unknown = body.servings;

  const isValidServings =
    servings === null ||
    (typeof servings === "number" && Number.isInteger(servings) && servings >= 1 && servings <= 20);

  if (!("servings" in body) || !isValidServings) {
    return NextResponse.json(
      { data: null, error: "Portionen müssen zwischen 1 und 20 liegen." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("meal_plan_entries")
    .update({ servings })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, servings")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("meal_plan_entries")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data: null, error: null });
}
