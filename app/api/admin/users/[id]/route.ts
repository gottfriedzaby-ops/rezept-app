import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAdminUserDetail, parseWindow } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const window = parseWindow(request.nextUrl.searchParams.get("window"));
  try {
    const data = await fetchAdminUserDetail(id, window);
    if (!data) {
      return NextResponse.json(
        { data: null, error: "Nutzer nicht gefunden" },
        { status: 404 },
      );
    }
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fehler beim Laden des Nutzers";
    console.error("[api/admin/users/[id]] GET failed:", err);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Refuse to delete the currently signed-in admin.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === id) {
    return NextResponse.json(
      { data: null, error: "Eigenes Konto kann nicht über das Dashboard gelöscht werden." },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) {
    console.error("[api/admin/users/[id]] DELETE failed:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }
  console.info("[admin-action] delete-user", {
    admin: user?.email ?? null,
    target_user_id: id,
    at: new Date().toISOString(),
  });
  return NextResponse.json({ data: { id }, error: null });
}
