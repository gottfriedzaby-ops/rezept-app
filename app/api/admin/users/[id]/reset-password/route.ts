import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: target, error: lookupError } = await supabaseAdmin.auth.admin.getUserById(id);
  if (lookupError || !target?.user?.email) {
    return NextResponse.json(
      { data: null, error: "Nutzer nicht gefunden" },
      { status: 404 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: target.user.email,
  });
  if (error) {
    console.error("[api/admin/users/[id]/reset-password] failed:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }
  console.info("[admin-action] reset-password", {
    admin: user?.email ?? null,
    target_user_id: id,
    target_email: target.user.email,
    at: new Date().toISOString(),
  });
  return NextResponse.json({ data: { id }, error: null });
}
