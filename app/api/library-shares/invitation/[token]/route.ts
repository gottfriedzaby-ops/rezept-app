import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Public — no auth required. Returns owner display name + recipient email for the invitation UI.
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { data: share } = await supabaseAdmin
    .from("library_shares")
    .select("owner_id, recipient_email, status, invitation_token")
    .eq("invitation_token", params.token)
    .maybeSingle();

  if (!share) {
    return NextResponse.json({ data: null, error: "Einladung nicht gefunden." }, { status: 404 });
  }
  if (share.status === "revoked") {
    return NextResponse.json(
      { data: null, error: "Diese Einladung ist nicht mehr gültig." },
      { status: 410 }
    );
  }
  if (!share.invitation_token) {
    return NextResponse.json(
      { data: null, error: "Diese Einladung wurde bereits eingelöst." },
      { status: 410 }
    );
  }

  const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
  const ownerName =
    (ownerData.user?.user_metadata?.full_name as string) ||
    ownerData.user?.email ||
    "Unbekannt";

  return NextResponse.json({
    data: {
      owner_display_name: ownerName,
      recipient_email: share.recipient_email,
      status: share.status,
    },
    error: null,
  });
}
