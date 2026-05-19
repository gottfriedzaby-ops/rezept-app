import { supabaseAdmin } from "@/lib/supabase";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isInviteOnlyEnabled(): boolean {
  return (
    (process.env.INVITE_ONLY_REGISTRATION ?? "true").toLowerCase() === "true"
  );
}

export async function isEmailInvited(email: string): Promise<boolean> {
  if (!isInviteOnlyEnabled()) return true;
  if (!email) return false;
  // Fail closed: any error (table missing during a partial migration,
  // network issue, malformed query) blocks the signup rather than allowing
  // a random email through.
  try {
    const { data, error } = await supabaseAdmin
      .from("invited_emails")
      .select("email")
      .eq("email", normalizeEmail(email))
      .maybeSingle();
    if (error) {
      console.error("[invited-emails] lookup failed:", error);
      return false;
    }
    return !!data;
  } catch (err) {
    console.error("[invited-emails] lookup threw:", err);
    return false;
  }
}

export async function markInvitedRegistered(email: string): Promise<void> {
  if (!email) return;
  const { error } = await supabaseAdmin
    .from("invited_emails")
    .update({ registered_at: new Date().toISOString() })
    .eq("email", normalizeEmail(email));
  if (error) {
    console.error("[invited-emails] failed to mark registered:", error);
  }
}
