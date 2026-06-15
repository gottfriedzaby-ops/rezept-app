import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Daily cap on LLM-backed food lookups per user (the diary's manual
// "Nachschlagen" button). Only CACHE MISSES reach Claude and are logged to
// claude_api_calls, so cache hits are unmetered and never count here.
const FOOD_LOOKUP_FUNCTION = "lookupFoodNutrition";
export const DAILY_FOOD_LOOKUP_LIMIT = 30;

export interface FoodLookupRateLimitResult {
  userId: string | null;
  allowed: boolean;
  count: number;
  remaining: number;
}

export async function checkDailyFoodLookupLimit(): Promise<FoodLookupRateLimitResult> {
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
    .eq("function", FOOD_LOOKUP_FUNCTION)
    .gte("created_at", dayStart.toISOString());

  // Fail open when the tracking table is missing (42P01) or unreadable: the
  // feature degrades to "unmetered", never to "broken".
  if (error) {
    console.warn("[food-lookup-rate-limit] count failed:", error.message);
    return { userId: user.id, allowed: true, count: 0, remaining: DAILY_FOOD_LOOKUP_LIMIT };
  }

  const todayCount = count ?? 0;
  return {
    userId: user.id,
    allowed: todayCount < DAILY_FOOD_LOOKUP_LIMIT,
    count: todayCount,
    remaining: Math.max(0, DAILY_FOOD_LOOKUP_LIMIT - todayCount),
  };
}

export function foodLookupRateLimitErrorMessage(result: FoodLookupRateLimitResult): string {
  if (!result.userId) return "Nicht angemeldet";
  return `Tageslimit erreicht. Du hast heute bereits ${result.count} von ${DAILY_FOOD_LOOKUP_LIMIT} Lebensmittel-Abfragen genutzt. Das Limit wird um Mitternacht (UTC) zurückgesetzt.`;
}
