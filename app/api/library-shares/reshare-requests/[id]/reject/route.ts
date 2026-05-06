import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data: reshareReq } = await supabaseAdmin
    .from("library_share_reshare_requests")
    .select("*, parent_share:library_shares(owner_id)")
    .eq("id", params.id)
    .eq("status", "pending_owner_consent")
    .maybeSingle();

  if (!reshareReq) {
    return NextResponse.json({ data: null, error: "Anfrage nicht gefunden." }, { status: 404 });
  }

  const parentShare = reshareReq.parent_share as { owner_id: string } | null;
  if (!parentShare || parentShare.owner_id !== user.id) {
    return NextResponse.json({ data: null, error: "Nicht berechtigt." }, { status: 403 });
  }

  await supabaseAdmin
    .from("library_share_reshare_requests")
    .update({ status: "rejected", resolved_at: new Date().toISOString() })
    .eq("id", params.id);

  return NextResponse.json({ data: null, error: null });
}
