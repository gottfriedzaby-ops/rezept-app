import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  checkDailyAssistantLimit,
  assistantRateLimitErrorMessage,
} from "@/lib/assistant-rate-limit";
import { suggestWeekPlan, toAssistantSummary, type OpenSlot } from "@/lib/assistant";
import { addDays, getWeekDates, isValidIsoDate, snapToWeekStart, getWeekStart } from "@/lib/meal-plan";
import type { Ingredient, RecipeSection, RecipeType } from "@/types/recipe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RecipeRow {
  id: string;
  title: string;
  tags: string[] | null;
  recipe_type: RecipeType | null;
  prep_time: number | null;
  cook_time: number | null;
  ingredients: Ingredient[] | null;
  sections: RecipeSection[] | null;
  last_cooked_at?: string | null;
}

// Suggests recipes for the week's empty dinner slots (MVP: Abend only) —
// a preview the client applies via the regular POST /api/meal-plan.
export async function POST(request: NextRequest) {
  const limit = await checkDailyAssistantLimit();
  if (!limit.userId) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { data: null, error: assistantRateLimitErrorMessage(limit) },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const weekParam: string = typeof body.week === "string" ? body.week : "";
  const week =
    weekParam && isValidIsoDate(weekParam) ? snapToWeekStart(weekParam) : getWeekStart();

  const [{ data: entries, error: entriesError }, { data: rows, error: recipesError }] =
    await Promise.all([
      supabaseAdmin
        .from("meal_plan_entries")
        .select("date, meal_slot, recipe_id, created_at")
        .eq("user_id", limit.userId)
        .gte("date", addDays(week, -14))
        .lt("date", addDays(week, 7)),
      supabaseAdmin
        .from("recipes")
        .select("id, title, tags, recipe_type, prep_time, cook_time, ingredients, sections, last_cooked_at")
        .eq("user_id", limit.userId)
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<RecipeRow[]>(),
    ]);

  // Meal-plan table missing (42P01) → there is nothing to plan into.
  if (entriesError) {
    return NextResponse.json(
      { data: null, error: "Der Wochenplan ist noch nicht eingerichtet." },
      { status: 503 }
    );
  }
  if (recipesError) {
    return NextResponse.json({ data: null, error: recipesError.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ data: { week, suggestions: [] }, error: null });
  }

  const weekDates = new Set(getWeekDates(week));
  const occupied = new Set(
    (entries ?? [])
      .filter((e) => weekDates.has(e.date as string))
      .map((e) => `${e.date}|${e.meal_slot}`)
  );
  const openSlots: OpenSlot[] = getWeekDates(week)
    .filter((date) => !occupied.has(`${date}|abend`))
    .map((date) => ({ date, meal_slot: "abend" as const }));

  if (openSlots.length === 0) {
    return NextResponse.json({ data: { week, suggestions: [] }, error: null });
  }

  // Variety input: recently planned (past 2 weeks + this week) and recently cooked
  const recentlyPlanned = (entries ?? []).map((e) => e.recipe_id as string);
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentlyCooked = rows
    .filter((r) => r.last_cooked_at && Date.parse(r.last_cooked_at) > twoWeeksAgo)
    .map((r) => r.id);
  const recentRecipeIds = Array.from(new Set([...recentlyPlanned, ...recentlyCooked]));

  try {
    const suggestions = await suggestWeekPlan(
      { openSlots, recipes: rows.map(toAssistantSummary), recentRecipeIds },
      limit.userId,
    );

    const byId = new Map(rows.map((r) => [r.id, r]));
    const enriched = suggestions.flatMap((s) => {
      const recipe = byId.get(s.recipe_id);
      if (!recipe) return [];
      return [{ ...s, recipe_title: recipe.title }];
    });

    return NextResponse.json({ data: { week, suggestions: enriched }, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: "Der Assistent ist gerade nicht erreichbar. Bitte versuche es erneut." },
      { status: 502 }
    );
  }
}
