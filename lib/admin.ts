import type { User } from "@supabase/supabase-js";

function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().has(email.trim().toLowerCase());
}

export function isAdmin(
  user: Pick<User, "email"> | null | undefined,
): boolean {
  return isAdminEmail(user?.email);
}
