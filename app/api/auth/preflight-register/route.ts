import { NextRequest, NextResponse } from "next/server";
import { isEmailInvited, isInviteOnlyEnabled } from "@/lib/invited-emails";

export const dynamic = "force-dynamic";

// Anonymous endpoint: the /register page calls this before supabase.auth.signUp
// to short-circuit when invite-only registration is enabled and the email is
// not on the allowlist. A determined client can bypass this — defence in depth
// against that bypass would require a Supabase Auth hook, which is out of
// scope for the foundation PR.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";

  if (!email) {
    return NextResponse.json(
      { data: null, error: "E-Mail-Adresse fehlt." },
      { status: 400 },
    );
  }

  if (!isInviteOnlyEnabled()) {
    return NextResponse.json({ data: { allowed: true }, error: null });
  }

  const allowed = await isEmailInvited(email);
  if (!allowed) {
    return NextResponse.json(
      {
        data: { allowed: false },
        error:
          "Diese E-Mail-Adresse ist nicht für die Registrierung freigeschaltet.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ data: { allowed: true }, error: null });
}
