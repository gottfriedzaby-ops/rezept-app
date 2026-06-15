import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

// PATCH stops the running fast (sets ended_at = now()). Only an open session
// owned by the user can be stopped.
export async function PATCH(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("fasting_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .is("ended_at", null)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("fasting_sessions")
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
