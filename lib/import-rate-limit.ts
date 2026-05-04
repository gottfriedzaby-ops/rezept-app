import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const DAILY_IMPORT_LIMIT = 20;

export interface RateLimitResult {
  userId: string | null;
  allowed: boolean;
  count: number;
  remaining: number;
}

export async function checkDailyImportLimit(): Promise<RateLimitResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { userId: null, allowed: false, count: 0, remaining: 0 };
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { count } = await supabaseAdmin
    .from("recipes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", dayStart.toISOString());

  const todayCount = count ?? 0;
  return {
    userId: user.id,
    allowed: todayCount < DAILY_IMPORT_LIMIT,
    count: todayCount,
    remaining: Math.max(0, DAILY_IMPORT_LIMIT - todayCount),
  };
}

export function rateLimitErrorMessage(result: RateLimitResult): string {
  if (!result.userId) return "Nicht angemeldet";
  return `Tageslimit erreicht. Du hast heute bereits ${result.count} von ${DAILY_IMPORT_LIMIT} Rezepten importiert. Das Limit wird um Mitternacht (UTC) zurückgesetzt.`;
}
