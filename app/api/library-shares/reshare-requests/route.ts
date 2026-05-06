import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  // Shares owned by this user
  const { data: ownedShares } = await supabaseAdmin
    .from("library_shares")
    .select("id")
    .eq("owner_id", user.id);

  const ownedIds = (ownedShares ?? []).map((s) => s.id);

  const { data: requests, error } = await supabaseAdmin
    .from("library_share_reshare_requests")
    .select("*")
    .or(
      `requested_by_id.eq.${user.id}${
        ownedIds.length ? `,parent_share_id.in.(${ownedIds.join(",")})` : ""
      }`
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  return NextResponse.json({ data: requests ?? [], error: null });
}
