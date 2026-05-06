import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { LibraryShareInbound } from "@/types/library-sharing";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data: shares, error } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("recipient_id", user.id)
    .in("status", ["pending", "accepted"])
    .order("invited_at", { ascending: false });

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const enriched: LibraryShareInbound[] = await Promise.all(
    (shares ?? []).map(async (share) => {
      let owner_display_name: string | null = null;
      let owner_email = share.recipient_email; // fallback
      const { data } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
      if (data.user) {
        owner_email = data.user.email ?? share.recipient_email;
        owner_display_name =
          (data.user.user_metadata?.full_name as string) || null;
      }
      return { ...share, owner_display_name, owner_email };
    })
  );

  return NextResponse.json({ data: enriched, error: null });
}
