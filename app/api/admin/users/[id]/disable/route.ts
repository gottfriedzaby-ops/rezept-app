import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 100 years should be enough — supabase-js will accept a duration string.
const DISABLE_DURATION = "876000h";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action: "disable" | "enable" =
    body.action === "enable" ? "enable" : "disable";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === id && action === "disable") {
    return NextResponse.json(
      { data: null, error: "Eigenes Konto kann nicht deaktiviert werden." },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
    ban_duration: action === "disable" ? DISABLE_DURATION : "none",
  });
  if (error) {
    console.error("[api/admin/users/[id]/disable] failed:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }
  console.info(`[admin-action] ${action}-user`, {
    admin: user?.email ?? null,
    target_user_id: id,
    at: new Date().toISOString(),
  });
  return NextResponse.json({ data: { id, action }, error: null });
}
