import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidIsoDate } from "@/lib/meal-plan";
import {
  LOG_MEAL_SLOTS,
  type DailyLog,
  type FoodLogEntry,
  type LogMealSlot,
  type MacroTotals,
} from "@/types/nutrition";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";

/** Today as an ISO date string in UTC (diary day boundary = UTC midnight). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumTotals(entries: FoodLogEntry[]): MacroTotals {
  return entries.reduce<MacroTotals>(
    (acc, e) => {
      const s = e.servings;
      acc.kcal += e.kcal_per_serving * s;
      acc.protein_g += e.protein_g * s;
      acc.carbs_g += e.carbs_g * s;
      acc.fat_g += e.fat_g * s;
      return acc;
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

function roundTotals(t: MacroTotals): MacroTotals {
  return {
    kcal: Math.round(t.kcal),
    protein_g: Math.round(t.protein_g),
    carbs_g: Math.round(t.carbs_g),
    fat_g: Math.round(t.fat_g),
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam && isValidIsoDate(dateParam) ? dateParam : todayIso();

  const [entriesResult, profileResult] = await Promise.all([
    supabaseAdmin
      .from("food_log_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("meal_slot", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("nutrition_profiles")
      .select("target_kcal, target_protein_g, target_carbs_g, target_fat_g")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (entriesResult.error && entriesResult.error.code !== RELATION_MISSING) {
    console.error("[api/nutrition/log] GET entries failed:", entriesResult.error.message);
    return NextResponse.json(
      { data: null, error: entriesResult.error.message },
      { status: 500 }
    );
  }

  const entries = (entriesResult.data ?? []) as FoodLogEntry[];
  const totals = roundTotals(sumTotals(entries));

  let target: MacroTotals | null = null;
  let remaining: MacroTotals | null = null;
  const profile = profileResult.error ? null : profileResult.data;
  if (profile && profile.target_kcal != null) {
    target = {
      kcal: profile.target_kcal,
      protein_g: profile.target_protein_g ?? 0,
      carbs_g: profile.target_carbs_g ?? 0,
      fat_g: profile.target_fat_g ?? 0,
    };
    remaining = {
      kcal: target.kcal - totals.kcal,
      protein_g: target.protein_g - totals.protein_g,
      carbs_g: target.carbs_g - totals.carbs_g,
      fat_g: target.fat_g - totals.fat_g,
    };
  }

  const payload: DailyLog = { date, entries, totals, target, remaining };
  return NextResponse.json({ data: payload, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const date: string = typeof body.date === "string" ? body.date : "";
  const mealSlot: string = typeof body.meal_slot === "string" ? body.meal_slot : "";
  const source: string = typeof body.source === "string" ? body.source : "manual";
  const servings: number =
    typeof body.servings === "number" && Number.isFinite(body.servings) ? body.servings : 1;

  if (!isValidIsoDate(date)) {
    return NextResponse.json({ data: null, error: "Ungültiges Datum." }, { status: 400 });
  }
  if (!LOG_MEAL_SLOTS.includes(mealSlot as LogMealSlot)) {
    return NextResponse.json({ data: null, error: "Ungültige Mahlzeit." }, { status: 400 });
  }
  if (servings <= 0 || servings > 100) {
    return NextResponse.json(
      { data: null, error: "Die Menge muss zwischen 0 und 100 Portionen liegen." },
      { status: 400 }
    );
  }

  let insertRow: {
    user_id: string;
    recipe_id: string | null;
    date: string;
    meal_slot: string;
    source: string;
    label: string;
    servings: number;
    kcal_per_serving: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };

  if (source === "recipe") {
    const recipeId: string = typeof body.recipe_id === "string" ? body.recipe_id : "";
    if (!recipeId) {
      return NextResponse.json({ data: null, error: "recipe_id ist erforderlich." }, { status: 400 });
    }

    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select("id, user_id, title, kcal_per_serving, protein_g, carbs_g, fat_g")
      .eq("id", recipeId)
      .maybeSingle();

    if (recipeError || !recipe) {
      return NextResponse.json({ data: null, error: "Rezept nicht gefunden" }, { status: 404 });
    }
    if (recipe.user_id !== user.id) {
      return NextResponse.json({ data: null, error: "Keine Berechtigung" }, { status: 403 });
    }
    if (recipe.kcal_per_serving == null) {
      return NextResponse.json(
        {
          data: null,
          error: "Für dieses Rezept sind noch keine Nährwerte hinterlegt.",
          code: "NUTRITION_MISSING",
        },
        { status: 422 }
      );
    }

    insertRow = {
      user_id: user.id,
      recipe_id: recipe.id,
      date,
      meal_slot: mealSlot,
      source: "recipe",
      label: recipe.title,
      servings,
      kcal_per_serving: recipe.kcal_per_serving,
      protein_g: recipe.protein_g ?? 0,
      carbs_g: recipe.carbs_g ?? 0,
      fat_g: recipe.fat_g ?? 0,
    };
  } else if (source === "manual" || source === "photo") {
    const label: string = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 1 || label.length > 200) {
      return NextResponse.json(
        { data: null, error: "Der Name muss zwischen 1 und 200 Zeichen lang sein." },
        { status: 400 }
      );
    }
    const kcal = body.kcal_per_serving ?? body.kcal;
    const protein = body.protein_g ?? 0;
    const carbs = body.carbs_g ?? 0;
    const fat = body.fat_g ?? 0;
    const macros = { kcal, protein, carbs, fat };
    for (const [, value] of Object.entries(macros)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return NextResponse.json(
          { data: null, error: "Nährwerte müssen Zahlen ≥ 0 sein." },
          { status: 400 }
        );
      }
    }

    insertRow = {
      user_id: user.id,
      recipe_id: null,
      date,
      meal_slot: mealSlot,
      source,
      label,
      servings,
      kcal_per_serving: kcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
    };
  } else {
    return NextResponse.json({ data: null, error: "Ungültige Quelle." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("food_log_entries")
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    if (error.code === RELATION_MISSING) {
      return NextResponse.json(
        { data: null, error: "Das Ernährungstagebuch ist noch nicht eingerichtet.", code: RELATION_MISSING },
        { status: 503 }
      );
    }
    console.error("[api/nutrition/log] POST failed:", error.message);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null }, { status: 201 });
}
