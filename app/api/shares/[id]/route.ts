import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  // Revoke by setting revoked_at — only if the share belongs to the requesting user
  const { data, error } = await supabaseAdmin
    .from("shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data: null, error: null });
}
