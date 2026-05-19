import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeEmail } from "@/lib/invited-emails";

export const dynamic = "force-dynamic";

// Middleware already gates /api/admin/* to admin users. The auth.getUser()
// call here is defence in depth and provides `invited_by` for inserts.

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("invited_emails")
    .select("email, invited_at, registered_at")
    .order("invited_at", { ascending: false });

  if (error) {
    console.error("[api/admin/invited-emails] GET failed:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ data, error: null });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const rawEmail = typeof body.email === "string" ? body.email : "";
  const email = normalizeEmail(rawEmail);

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { data: null, error: "Ungültige E-Mail-Adresse." },
      { status: 400 },
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("invited_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { data: null, error: "Diese E-Mail ist bereits freigeschaltet." },
      { status: 409 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("invited_emails")
    .insert({ email, invited_by: user.id })
    .select("email, invited_at, registered_at")
    .single();

  if (error) {
    console.error("[api/admin/invited-emails] POST failed:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ data, error: null });
}
