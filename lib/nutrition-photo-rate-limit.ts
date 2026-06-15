import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PHOTO_NUTRITION_FUNCTION } from "@/lib/claude";

// Daily cap on photo-based nutrition estimates per user. Claude Vision (Sonnet)
// is pricier than the diary's text estimates, so the limit is tighter than the
// import limit. Counted over claude_api_calls — the same log that feeds the
// admin cost dashboard — so no extra table is needed.
export const DAILY_PHOTO_ESTIMATE_LIMIT = 15;

export interface PhotoEstimateRateLimitResult {
  userId: string | null;
  allowed: boolean;
  count: number;
  remaining: number;
}

export async function checkDailyPhotoEstimateLimit(): Promise<PhotoEstimateRateLimitResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, allowed: false, count: 0, remaining: 0 };
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("claude_api_calls")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("function", PHOTO_NUTRITION_FUNCTION)
    .gte("created_at", dayStart.toISOString());

  // Fail open when the tracking table is missing (42P01) or unreadable: the
  // feature degrades to "unmetered", never to "broken".
  if (error) {
    console.warn("[nutrition-photo-rate-limit] count failed:", error.message);
    return { userId: user.id, allowed: true, count: 0, remaining: DAILY_PHOTO_ESTIMATE_LIMIT };
  }

  const todayCount = count ?? 0;
  return {
    userId: user.id,
    allowed: todayCount < DAILY_PHOTO_ESTIMATE_LIMIT,
    count: todayCount,
    remaining: Math.max(0, DAILY_PHOTO_ESTIMATE_LIMIT - todayCount),
  };
}

export function photoEstimateRateLimitErrorMessage(result: PhotoEstimateRateLimitResult): string {
  if (!result.userId) return "Nicht angemeldet";
  return `Tageslimit erreicht. Du hast heute bereits ${result.count} von ${DAILY_PHOTO_ESTIMATE_LIMIT} Foto-Schätzungen genutzt. Das Limit wird um Mitternacht (UTC) zurückgesetzt.`;
}
