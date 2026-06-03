import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendReshareConsentRequest } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  // Caller must be the recipient of an accepted share
  const { data: share } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("id", params.id)
    .eq("recipient_id", user.id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!share) {
    return NextResponse.json(
      { data: null, error: "Kein aktiver Zugriff auf diese Sammlung." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const targetEmail: string = (body.target_email ?? "").trim().toLowerCase();

  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json(
      { data: null, error: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 }
    );
  }

  const { data: reshareReq, error } = await supabaseAdmin
    .from("library_share_reshare_requests")
    .insert({
      parent_share_id: params.id,
      requested_by_id: user.id,
      target_email: targetEmail,
      status: "pending_owner_consent",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  // Notify owner (email + push)
  const requesterName =
    (user.user_metadata?.full_name as string) || user.email || "";
  const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(share.owner_id);
  if (ownerData.user?.email) {
    await sendReshareConsentRequest({
      ownerEmail: ownerData.user.email,
      requesterName,
      targetEmail,
    });
  }
  await sendPushToUser(share.owner_id, {
    title: "Weiterteilen-Anfrage",
    body: `${requesterName || "Jemand"} möchte deine Sammlung mit ${targetEmail} teilen.`,
    url: "/settings",
  });

  return NextResponse.json({ data: reshareReq, error: null }, { status: 201 });
}
