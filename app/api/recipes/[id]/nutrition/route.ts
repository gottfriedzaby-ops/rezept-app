import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { estimateNutrition } from "@/lib/claude";
import { getRecipeSections } from "@/types/recipe";
import type { Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabaseAdmin
      .from("recipes")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ data: null, error: "Rezept nicht gefunden" }, { status: 404 });
    }

    const recipe = data as Recipe;
    const sections = getRecipeSections(recipe);
    const allIngredients = sections.flatMap((s) => s.ingredients);

    if (!recipe.servings || recipe.servings <= 0 || allIngredients.length === 0) {
      return NextResponse.json(
        { data: null, error: "Nährwerte können nicht berechnet werden (fehlende Portionszahl oder Zutaten)" },
        { status: 400 }
      );
    }

    const nutrition = await estimateNutrition(allIngredients, recipe.servings);

    const { error: updateError } = await supabaseAdmin
      .from("recipes")
      .update(nutrition)
      .eq("id", params.id);

    if (updateError) {
      // Log but don't fail — return the estimated values so the UI can still display them.
      // Most likely cause: DB migration not yet applied (run supabase/migrations/20260505000000_feature08_nutrition_columns.sql).
      console.error("[nutrition] DB update failed:", updateError.message);
    }

    return NextResponse.json({ data: nutrition, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Berechnung fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
