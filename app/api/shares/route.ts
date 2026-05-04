import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("shares")
    .select("id, created_at, token, label, revoked_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const label: string | undefined = body.label;

  const token = crypto.randomBytes(32).toString("base64url");

  const { data, error } = await supabaseAdmin
    .from("shares")
    .insert({ owner_id: user.id, token, label: label ?? null })
    .select("id, created_at, token, label, revoked_at")
    .single();

  if (error) throw error;
  return NextResponse.json({ data, error: null }, { status: 201 });
}
