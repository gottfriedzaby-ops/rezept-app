import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_settings")
    .upsert(
      { user_id: user.id, show_shared_in_main_library: true },
      { onConflict: "user_id", ignoreDuplicates: true }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body.show_shared_in_main_library === "boolean") {
    update.show_shared_in_main_library = body.show_shared_in_main_library;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ data: null, error: "Keine Felder zum Aktualisieren." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_settings")
    .upsert({ user_id: user.id, ...update }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  return NextResponse.json({ data, error: null });
}
