import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data: share } = await supabaseAdmin
    .from("library_shares")
    .select("id, status, invitation_token")
    .eq("invitation_token", params.token)
    .is("recipient_id", null)
    .maybeSingle();

  if (!share) {
    return NextResponse.json(
      { data: null, error: "Einladung nicht gefunden oder bereits eingelöst." },
      { status: 404 }
    );
  }
  if (share.status === "revoked") {
    return NextResponse.json(
      { data: null, error: "Diese Einladung ist nicht mehr gültig." },
      { status: 410 }
    );
  }

  const { error } = await supabaseAdmin
    .from("library_shares")
    .update({ recipient_id: user.id, invitation_token: null })
    .eq("id", share.id);

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  return NextResponse.json({ data: { share_id: share.id }, error: null });
}
