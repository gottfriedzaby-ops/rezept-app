import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  checkDailyAssistantLimit,
  assistantRateLimitErrorMessage,
} from "@/lib/assistant-rate-limit";
import { suggestRecipesFromPantry, toAssistantSummary } from "@/lib/assistant";
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
  servings: number | null;
  image_url: string | null;
  ingredients: Ingredient[] | null;
  sections: RecipeSection[] | null;
}

// „Was kann ich kochen?" — matches free-text pantry input against the user's
// own library and returns ranked suggestions with reasons + missing items.
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
  const pantry: string = typeof body.pantry === "string" ? body.pantry.trim() : "";
  if (pantry.length < 3 || pantry.length > 1000) {
    return NextResponse.json(
      { data: null, error: "Bitte beschreibe deine Vorräte (3–1000 Zeichen)." },
      { status: 400 }
    );
  }

  const { data: rows, error } = await supabaseAdmin
    .from("recipes")
    .select("id, title, tags, recipe_type, prep_time, cook_time, servings, image_url, ingredients, sections")
    .eq("user_id", limit.userId)
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<RecipeRow[]>();

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ data: { suggestions: [] }, error: null });
  }

  try {
    const suggestions = await suggestRecipesFromPantry(
      pantry,
      rows.map(toAssistantSummary),
      limit.userId,
    );

    const byId = new Map(rows.map((r) => [r.id, r]));
    const enriched = suggestions.flatMap((s) => {
      const recipe = byId.get(s.recipe_id);
      if (!recipe) return [];
      return [
        {
          recipe: {
            id: recipe.id,
            title: recipe.title,
            tags: recipe.tags ?? [],
            recipe_type: recipe.recipe_type,
            image_url: recipe.image_url,
            total_time: (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0),
            servings: recipe.servings,
          },
          reason: s.reason,
          missing: s.missing,
        },
      ];
    });

    return NextResponse.json({ data: { suggestions: enriched }, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: "Der Assistent ist gerade nicht erreichbar. Bitte versuche es erneut." },
      { status: 502 }
    );
  }
}
