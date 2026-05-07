import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  checkDailyInvitationLimit,
  invitationRateLimitErrorMessage,
} from "@/lib/invitation-rate-limit";
import {
  sendInvitationToRegistered,
  sendInvitationToUnregistered,
} from "@/lib/email";
import type { LibraryShareOutbound } from "@/types/library-sharing";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function displayName(meta: Record<string, unknown> | null, email: string): string {
  return (meta?.full_name as string) || email;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const { data: shares, error } = await supabaseAdmin
    .from("library_shares")
    .select("*")
    .eq("owner_id", user.id)
    .neq("status", "revoked")
    .order("invited_at", { ascending: false });

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  const enriched: LibraryShareOutbound[] = await Promise.all(
    (shares ?? []).map(async (share) => {
      let recipient_display_name: string | null = null;
      if (share.recipient_id) {
        const { data } = await supabaseAdmin.auth.admin.getUserById(share.recipient_id);
        if (data.user) {
          recipient_display_name = displayName(
            data.user.user_metadata ?? null,
            data.user.email ?? share.recipient_email
          );
        }
      }
      return { ...share, recipient_display_name };
    })
  );

  return NextResponse.json({ data: enriched, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const recipientEmail: string = (body.recipient_email ?? "").trim().toLowerCase();

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json(
      { data: null, error: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 }
    );
  }

  if (recipientEmail === user.email?.toLowerCase()) {
    return NextResponse.json(
      { data: null, error: "Du kannst deine Bibliothek nicht mit dir selbst teilen." },
      { status: 400 }
    );
  }

  // Check for existing non-revoked share with same owner+email
  const { data: existing } = await supabaseAdmin
    .from("library_shares")
    .select("id, status")
    .eq("owner_id", user.id)
    .eq("recipient_email", recipientEmail)
    .neq("status", "revoked")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        data: null,
        error:
          "Für diese E-Mail-Adresse besteht bereits eine Einladung oder ein aktiver Zugriff.",
      },
      { status: 400 }
    );
  }

  const rateLimit = await checkDailyInvitationLimit(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { data: null, error: invitationRateLimitErrorMessage() },
      { status: 429 }
    );
  }

  // Check if recipient is already registered
  let recipientId: string | null = null;
  const { data: recipientAuthData } = await supabaseAdmin.auth.admin.listUsers();
  const recipientUser = recipientAuthData?.users?.find(
    (u) => u.email?.toLowerCase() === recipientEmail
  );
  if (recipientUser) recipientId = recipientUser.id;

  const invitationToken = crypto.randomBytes(32).toString("base64url");
  const ownerName = displayName(user.user_metadata ?? null, user.email ?? "");

  const { data: share, error: insertError } = await supabaseAdmin
    .from("library_shares")
    .insert({
      owner_id: user.id,
      recipient_id: recipientId,
      recipient_email: recipientEmail,
      status: "pending",
      invitation_token: invitationToken,
      invited_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError)
    return NextResponse.json({ data: null, error: insertError.message }, { status: 500 });

  // Send email (non-blocking — failure doesn't prevent share creation)
  if (recipientId) {
    const emailResult = await sendInvitationToRegistered({ ownerName, recipientEmail });
    if (!emailResult.success) console.error("[library-shares] sendInvitationToRegistered failed:", emailResult.error);
  } else {
    const emailResult = await sendInvitationToUnregistered({ ownerName, recipientEmail, invitationToken });
    if (!emailResult.success) console.error("[library-shares] sendInvitationToUnregistered failed:", emailResult.error);
  }

  return NextResponse.json({ data: share, error: null }, { status: 201 });
}
