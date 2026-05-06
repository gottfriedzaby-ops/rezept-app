import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("library_shares")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .in("status", ["pending", "accepted"])
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: "Nicht gefunden." }, { status: 404 });

  return NextResponse.json({ data: null, error: null });
}
