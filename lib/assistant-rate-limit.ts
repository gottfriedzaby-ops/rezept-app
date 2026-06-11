import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ASSISTANT_FUNCTION_NAMES } from "@/lib/claude";

// Daily cap on AI-assistant calls per user (pantry suggestions, week plans,
// cooking questions). Counted over claude_api_calls — the same log that feeds
// the admin cost dashboard — so the limit needs no extra table.
export const DAILY_ASSISTANT_LIMIT = 30;

export interface AssistantRateLimitResult {
  userId: string | null;
  allowed: boolean;
  count: number;
  remaining: number;
}

export async function checkDailyAssistantLimit(): Promise<AssistantRateLimitResult> {
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
    .in("function", ASSISTANT_FUNCTION_NAMES)
    .gte("created_at", dayStart.toISOString());

  // Fail open when the tracking table is missing (42P01) or unreadable:
  // the assistant degrades to "unmetered", never to "broken".
  if (error) {
    console.warn("[assistant-rate-limit] count failed:", error.message);
    return { userId: user.id, allowed: true, count: 0, remaining: DAILY_ASSISTANT_LIMIT };
  }

  const todayCount = count ?? 0;
  return {
    userId: user.id,
    allowed: todayCount < DAILY_ASSISTANT_LIMIT,
    count: todayCount,
    remaining: Math.max(0, DAILY_ASSISTANT_LIMIT - todayCount),
  };
}

export function assistantRateLimitErrorMessage(result: AssistantRateLimitResult): string {
  if (!result.userId) return "Nicht angemeldet";
  return `Tageslimit erreicht. Du hast heute bereits ${result.count} von ${DAILY_ASSISTANT_LIMIT} Assistent-Anfragen gestellt. Das Limit wird um Mitternacht (UTC) zurückgesetzt.`;
}
