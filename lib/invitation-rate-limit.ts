import { supabaseAdmin } from "@/lib/supabase";

export const DAILY_INVITATION_LIMIT = 5;

export interface InvitationRateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
}

export async function checkDailyInvitationLimit(
  userId: string
): Promise<InvitationRateLimitResult> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin
    .from("library_shares")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", userId)
    .gte("invited_at", dayStart.toISOString());

  const todayCount = count ?? 0;
  return {
    allowed: todayCount < DAILY_INVITATION_LIMIT,
    count: todayCount,
    remaining: Math.max(0, DAILY_INVITATION_LIMIT - todayCount),
  };
}

export function invitationRateLimitErrorMessage(): string {
  return `Du hast heute bereits ${DAILY_INVITATION_LIMIT} Einladungen gesendet. Bitte versuche es morgen erneut.`;
}
