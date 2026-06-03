import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// POST: store (or refresh) the caller's push subscription for this device.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint: string = body?.endpoint ?? "";
  const p256dh: string = body?.keys?.p256dh ?? "";
  const auth: string = body?.keys?.auth ?? "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ data: null, error: "Ungültige Subscription." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: typeof body?.userAgent === "string" ? body.userAgent.slice(0, 400) : null,
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) {
    console.error("[api/push/subscribe] upsert failed:", error);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: { ok: true }, error: null }, { status: 201 });
}

// DELETE: remove the caller's subscription for a given endpoint (unsubscribe).
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const endpoint: string = body?.endpoint ?? "";
  if (!endpoint) return NextResponse.json({ data: null, error: "Endpoint fehlt." }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  if (error) {
    console.error("[api/push/subscribe] delete failed:", error);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: { ok: true }, error: null });
}
