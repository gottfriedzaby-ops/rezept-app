import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  STATS_RANGES,
  buildStatsSummary,
  getStatsRange,
  type NutritionStatsResponse,
  type StatsRange,
} from "@/lib/nutrition-stats";
import type { FoodLogEntry, MacroTotals } from "@/types/nutrition";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";

/** Today as an ISO date string in UTC (diary day boundary = UTC midnight). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const rangeParam = request.nextUrl.searchParams.get("range");
  const range: StatsRange = STATS_RANGES.includes(rangeParam as StatsRange)
    ? (rangeParam as StatsRange)
    : "week";

  const today = todayIso();
  const { start, end } = getStatsRange(today, range);

  const [entriesResult, profileResult] = await Promise.all([
    supabaseAdmin
      .from("food_log_entries")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true }),
    supabaseAdmin
      .from("nutrition_profiles")
      .select("target_kcal, target_protein_g, target_carbs_g, target_fat_g")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (entriesResult.error && entriesResult.error.code === RELATION_MISSING) {
    console.warn(
      "[api/nutrition/stats] Tabelle 'food_log_entries' fehlt — Migration 20260615000000_feature19_nutrition_tracking.sql ausführen."
    );
  } else if (entriesResult.error) {
    console.error("[api/nutrition/stats] GET entries failed:", entriesResult.error.message);
    return NextResponse.json(
      { data: null, error: entriesResult.error.message },
      { status: 500 }
    );
  }

  const entries = (entriesResult.error ? [] : entriesResult.data ?? []) as FoodLogEntry[];
  const summary = buildStatsSummary(entries, today, range);

  let target: MacroTotals | null = null;
  const profile = profileResult.error ? null : profileResult.data;
  if (profile && profile.target_kcal != null) {
    target = {
      kcal: profile.target_kcal,
      protein_g: profile.target_protein_g ?? 0,
      carbs_g: profile.target_carbs_g ?? 0,
      fat_g: profile.target_fat_g ?? 0,
    };
  }

  const payload: NutritionStatsResponse = { summary, target };
  return NextResponse.json({ data: payload, error: null });
}
