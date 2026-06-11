import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { addDays, getWeekStart, isValidIsoDate } from "@/lib/meal-plan";
import { MEAL_SLOTS, type MealSlot } from "@/types/meal-plan";

export const dynamic = "force-dynamic";

const RECIPE_JOIN = "*, recipe:recipes(id, title, image_url, recipe_type, servings, tags, ingredients, sections)";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const weekParam = request.nextUrl.searchParams.get("week");
  const week = weekParam && isValidIsoDate(weekParam) ? weekParam : getWeekStart();

  const { data, error } = await supabaseAdmin
    .from("meal_plan_entries")
    .select(RECIPE_JOIN)
    .eq("user_id", user.id)
    .gte("date", week)
    .lt("date", addDays(week, 7))
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const date: string = typeof body.date === "string" ? body.date : "";
  const mealSlot: string = typeof body.meal_slot === "string" ? body.meal_slot : "";
  const recipeId: string = typeof body.recipe_id === "string" ? body.recipe_id : "";
  const servings: number | null =
    typeof body.servings === "number" ? body.servings : null;

  if (!isValidIsoDate(date)) {
    return NextResponse.json({ data: null, error: "Ungültiges Datum." }, { status: 400 });
  }
  if (!MEAL_SLOTS.includes(mealSlot as MealSlot)) {
    return NextResponse.json({ data: null, error: "Ungültige Mahlzeit." }, { status: 400 });
  }
  if (!recipeId) {
    return NextResponse.json({ data: null, error: "recipe_id ist erforderlich." }, { status: 400 });
  }
  if (servings !== null && (!Number.isInteger(servings) || servings < 1 || servings > 20)) {
    return NextResponse.json(
      { data: null, error: "Portionen müssen zwischen 1 und 20 liegen." },
      { status: 400 }
    );
  }

  // MVP: only own recipes can be planned
  const { data: recipe, error: recipeError } = await supabaseAdmin
    .from("recipes")
    .select("id, user_id")
    .eq("id", recipeId)
    .maybeSingle();

  if (recipeError || !recipe) {
    return NextResponse.json({ data: null, error: "Rezept nicht gefunden" }, { status: 404 });
  }
  if (recipe.user_id !== user.id) {
    return NextResponse.json({ data: null, error: "Keine Berechtigung" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("meal_plan_entries")
    .insert({
      user_id: user.id,
      recipe_id: recipeId,
      date,
      meal_slot: mealSlot,
      servings,
    })
    .select(RECIPE_JOIN)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { data: null, error: "Dieses Rezept ist für diese Mahlzeit bereits eingeplant." },
        { status: 409 }
      );
    }
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null }, { status: 201 });
}
