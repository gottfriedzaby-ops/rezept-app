import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { ParsedRecipe, Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";

interface ConfirmBody {
  recipe: ParsedRecipe;
  sourceTitle?: string | null;
  stepImages?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const { recipe, sourceTitle, stepImages = [] } = (await request.json()) as ConfirmBody;

    if (!recipe) {
      return NextResponse.json({ data: null, error: "recipe is required" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .eq("source_value", recipe.source.value)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { data: null, error: "Ein Rezept aus dieser Quelle existiert bereits" },
        { status: 409 }
      );
    }

    const { data: insertData, error: dbError } = await supabaseAdmin
      .from("recipes")
      .insert({
        title: recipe.title,
        servings: recipe.servings,
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        tags: recipe.tags,
        source_type: recipe.source.type,
        source_value: recipe.source.value,
        source_title: sourceTitle ?? null,
        description: null,
        image_url: null,
        step_images: stepImages,
      })
      .select()
      .single();

    const saved = insertData as Recipe | null;
    if (dbError) throw dbError;

    return NextResponse.json({ data: saved, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speichern fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
