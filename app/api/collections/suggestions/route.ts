import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCollectionSuggestionsForUser } from "@/lib/collection-suggestions-server";

export const dynamic = "force-dynamic";

// Vorgeschlagene Sammlungen für den angemeldeten Nutzer. Eine weiche
// Zusatzfunktion — bei fehlenden Tabellen liefert der Helper [] (kein 503).
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const suggestions = await getCollectionSuggestionsForUser(user.id);
  return NextResponse.json({ data: { suggestions }, error: null });
}
