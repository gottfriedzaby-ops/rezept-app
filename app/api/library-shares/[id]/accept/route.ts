import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendAcceptanceNotification } from "@/lib/email";

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

  const { data: share } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("id", params.id)
    .eq("recipient_id", user.id)
    .maybeSingle();

  if (!share) return NextResponse.json({ data: null, error: "Nicht gefunden." }, { status: 404 });
  if (share.status === "revoked") {
    return NextResponse.json(
      { data: null, error: "Diese Einladung ist nicht mehr gültig." },
      { status: 410 }
    );
  }
  if (share.status !== "pending") {
    return NextResponse.json(
      { data: null, error: "Diese Einladung kann nicht mehr angenommen werden." },
      { status: 400 }
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("library_shares")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  // Notify owner (non-blocking)
  const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
  if (ownerData.user?.email) {
    const recipientName =
      (user.user_metadata?.full_name as string) || user.email || "";
    await sendAcceptanceNotification({
      ownerEmail: ownerData.user.email,
      recipientName,
    });
  }

  return NextResponse.json({ data: updated, error: null });
}
