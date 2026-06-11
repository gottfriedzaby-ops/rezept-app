import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

const DUPLICATE_NAME_MESSAGE = "Eine Sammlung mit diesem Namen existiert bereits.";
const INVALID_NAME_MESSAGE = "Der Name muss zwischen 1 und 100 Zeichen lang sein.";

export async function PATCH(request: NextRequest, { params }: Params) {
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
    .update({ name })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error?.code === "23505") {
    return NextResponse.json({ data: null, error: DUPLICATE_NAME_MESSAGE }, { status: 409 });
  }
  if (error || !data) {
    return NextResponse.json({ data: null, error: "Sammlung nicht gefunden" }, { status: 404 });
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
    .from("collections")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Sammlung nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data: null, error: null });
}
