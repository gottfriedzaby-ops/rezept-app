import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { lookupFoodNutrition } from "@/lib/claude";
import { normalizeIngredientName } from "@/lib/ingredient-categories";
import { getFoodByName, saveFood, type FoodDatabaseRow } from "@/lib/food-database-store";
import {
  checkDailyFoodLookupLimit,
  foodLookupRateLimitErrorMessage,
} from "@/lib/food-lookup-rate-limit";
import type { FoodLookupResult } from "@/types/nutrition";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_NAME = 200;

// Resolve per-serving nutrition for a typed food name, layering:
//   1. shared cross-user cache (food_database) — one Claude lookup benefits everyone
//   2. Claude (claude-haiku-4-5) for names new to the whole system, whose answer
//      is then persisted to the cache for future requests.
// Cache hits never call Claude and are unmetered; only misses count against the
// daily food-lookup limit. Degrades gracefully if the table is missing (42P01).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const rawName = typeof body?.name === "string" ? body.name : "";
    if (rawName.length > MAX_NAME) {
      return NextResponse.json({ data: null, error: "Der Name ist zu lang." }, { status: 400 });
    }
    const norm = normalizeIngredientName(rawName);
    if (!norm) {
      return NextResponse.json({ data: null, error: "Bitte gib einen Namen ein." }, { status: 400 });
    }

    // 1) Shared cache hit (unmetered).
    const cached = await getFoodByName(norm);
    if (cached) {
      return NextResponse.json({ data: toResult(cached, "db"), error: null });
    }

    // 2) Miss → rate-limit the Claude path only.
    const limit = await checkDailyFoodLookupLimit();
    if (!limit.allowed) {
      return NextResponse.json(
        { data: null, error: foodLookupRateLimitErrorMessage(limit) },
        { status: limit.userId ? 429 : 401 }
      );
    }

    const est = await lookupFoodNutrition(rawName, user.id);
    if (est.kcal_per_serving == null) {
      return NextResponse.json(
        {
          data: null,
          error: "Für dieses Lebensmittel konnten keine Nährwerte gefunden werden.",
          code: "LOOKUP_FAILED",
        },
        { status: 422 }
      );
    }

    const row: FoodDatabaseRow = {
      name: norm,
      display_name: est.display_name ?? rawName.trim(),
      kcal_per_serving: est.kcal_per_serving,
      protein_g: est.protein_g ?? 0,
      carbs_g: est.carbs_g ?? 0,
      fat_g: est.fat_g ?? 0,
      serving_desc: est.serving_desc,
      source: "llm",
    };

    // 3) Persist for every user (best-effort; 42P01-safe in the store).
    await saveFood(row);

    return NextResponse.json({ data: toResult(row, "estimate"), error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nachschlagen fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

function toResult(row: FoodDatabaseRow, origin: FoodLookupResult["origin"]): FoodLookupResult {
  return {
    display_name: row.display_name,
    kcal_per_serving: row.kcal_per_serving,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    serving_desc: row.serving_desc,
    origin,
  };
}
