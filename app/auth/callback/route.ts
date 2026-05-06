import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const invitation = searchParams.get("invitation");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Claim a pending library-share invitation embedded in the redirect URL
      if (invitation) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabaseAdmin
            .from("library_shares")
            .update({ recipient_id: user.id, invitation_token: null })
            .eq("invitation_token", invitation)
            .is("recipient_id", null);
        }
        return NextResponse.redirect(`${origin}/library-shares/incoming`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
