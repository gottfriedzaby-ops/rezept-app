import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeEmail } from "@/lib/invited-emails";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ email: string }> },
) {
  const { email: rawEmail } = await params;
  const email = normalizeEmail(decodeURIComponent(rawEmail));

  const { error } = await supabaseAdmin
    .from("invited_emails")
    .delete()
    .eq("email", email);

  if (error) {
    console.error("[api/admin/invited-emails/[email]] DELETE failed:", error);
    return NextResponse.json(
      { data: null, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { email }, error: null });
}
