import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  sendReshareApprovalToRequester,
  sendInvitationToRegistered,
  sendInvitationToUnregistered,
} from "@/lib/email";
import crypto from "crypto";

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
    .select("*, parent_share:library_shares(*)")
    .eq("id", params.id)
    .eq("status", "pending_owner_consent")
    .maybeSingle();

  if (!reshareReq) {
    return NextResponse.json({ data: null, error: "Anfrage nicht gefunden." }, { status: 404 });
  }

  // Caller must be the owner of the parent share
  const parentShare = reshareReq.parent_share as { owner_id: string } | null;
  if (!parentShare || parentShare.owner_id !== user.id) {
    return NextResponse.json({ data: null, error: "Nicht berechtigt." }, { status: 403 });
  }

  // Update request status
  await supabaseAdmin
    .from("library_share_reshare_requests")
    .update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("id", params.id);

  // Create new library_share for the target
  const targetEmail = reshareReq.target_email;
  const invitationToken = crypto.randomBytes(32).toString("base64url");

  const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers();
  const targetUser = allUsers?.users?.find(
    (u) => u.email?.toLowerCase() === targetEmail.toLowerCase()
  );
  const targetId = targetUser?.id ?? null;

  const { data: newShare, error: shareError } = await supabaseAdmin
    .from("library_shares")
    .insert({
      owner_id: user.id,
      recipient_id: targetId,
      recipient_email: targetEmail,
      status: "pending",
      invitation_token: invitationToken,
      invited_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (shareError)
    return NextResponse.json({ data: null, error: shareError.message }, { status: 500 });

  // Link resulting share back to request
  await supabaseAdmin
    .from("library_share_reshare_requests")
    .update({ resulting_share_id: newShare.id })
    .eq("id", params.id);

  const ownerName =
    (user.user_metadata?.full_name as string) || user.email || "";

  // Notify requester
  const { data: requesterData } = await supabaseAdmin.auth.admin.getUserById(
    reshareReq.requested_by_id
  );
  if (requesterData.user?.email) {
    await sendReshareApprovalToRequester({
      requesterEmail: requesterData.user.email,
      ownerName,
      targetEmail,
    });
  }

  // Send invitation to target
  if (targetId) {
    await sendInvitationToRegistered({ ownerName, recipientEmail: targetEmail });
  } else {
    await sendInvitationToUnregistered({
      ownerName,
      recipientEmail: targetEmail,
      invitationToken,
    });
  }

  return NextResponse.json({ data: { share_id: newShare.id }, error: null });
}
