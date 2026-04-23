import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { ParsedRecipe, Recipe } from "@/types/recipe";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";

interface ConfirmBody {
  recipe: ParsedRecipe;
  sourceTitle?: string | null;
  stepImages?: string[];
  imageUrl?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { recipe, sourceTitle, stepImages = [], imageUrl } = (await request.json()) as ConfirmBody;

    if (!recipe) {
      return NextResponse.json({ data: null, error: "recipe is required" }, { status: 400 });
    }

    const duplicate = await findDuplicateRecipe(recipe.title, recipe.source.value);
    if (duplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...duplicate },
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
        image_url: imageUrl ?? null,
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
