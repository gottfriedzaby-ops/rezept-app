import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isSmartCollectionKey } from "@/lib/collection-suggestions";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const TABLE_MISSING_MESSAGE = "Vorschläge sind noch nicht eingerichtet.";

/** Verwirft einen Kategorie-Vorschlag dauerhaft (pro Nutzer, geräteübergreifend). */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body.key !== "string" || !isSmartCollectionKey(body.key)) {
    return NextResponse.json({ data: null, error: "Ungültige Anfrage." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("collection_suggestion_dismissals")
    .insert({ user_id: user.id, category_key: body.key });

  if (error) {
    // Bereits verworfen → idempotenter Erfolg.
    if (error.code === "23505") {
      return NextResponse.json({ data: null, error: null });
    }
    if (error.code === RELATION_MISSING) {
      return NextResponse.json({ data: null, error: TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: null, error: null });
}
