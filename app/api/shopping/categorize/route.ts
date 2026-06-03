import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { categorizeIngredients } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Max ingredient names accepted per request — keeps the (cached, infrequent)
// Claude call cheap. The client only ever sends names unmapped by the static
// keyword map AND not already in its learned cache.
const MAX_NAMES = 50;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const names = Array.isArray(body?.names)
      ? (body.names as unknown[]).filter((n): n is string => typeof n === "string")
      : [];

    if (names.length === 0) {
      return NextResponse.json({ data: {}, error: null });
    }

    const categories = await categorizeIngredients(names.slice(0, MAX_NAMES), user.id);
    return NextResponse.json({ data: categories, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kategorisierung fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
