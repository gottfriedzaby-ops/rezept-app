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

  // Select first, insert defaults only if missing. Avoids the
  // upsert+ignoreDuplicates+.single() combination, which returns zero rows on
  // every subsequent call (because the conflict is silently ignored) and then
  // .single() throws.
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("user_settings")
    .select()
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("[api/settings] GET select failed:", selectError);
    return NextResponse.json({ data: null, error: selectError.message }, { status: 500 });
  }

  if (existing) return NextResponse.json({ data: existing, error: null });

  const { data: created, error: insertError } = await supabaseAdmin
    .from("user_settings")
    .insert({ user_id: user.id, show_shared_in_main_library: true })
    .select()
    .single();

  if (insertError) {
    // 23505: another concurrent first request inserted the row between our
    // select and insert — the existing row is what we wanted anyway.
    if (insertError.code === "23505") {
      const { data: raced, error: racedError } = await supabaseAdmin
        .from("user_settings")
        .select()
        .eq("user_id", user.id)
        .maybeSingle();
      if (raced) return NextResponse.json({ data: raced, error: null });
      console.error("[api/settings] GET re-select after 23505 failed:", racedError);
      return NextResponse.json(
        { data: null, error: racedError?.message ?? "Einstellungen konnten nicht geladen werden." },
        { status: 500 }
      );
    }
    console.error("[api/settings] GET insert failed:", insertError);
    return NextResponse.json({ data: null, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ data: created, error: null });
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

  if (error) {
    console.error("[api/settings] PATCH upsert failed:", error);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null });
}
