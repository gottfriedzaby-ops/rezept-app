import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ParsedRecipe, Recipe } from "@/types/recipe";
import { findDuplicateRecipe } from "@/lib/duplicate-check";
import { checkDailyImportLimit, rateLimitErrorMessage } from "@/lib/import-rate-limit";

export const dynamic = "force-dynamic";

interface ConfirmBody {
  recipe: ParsedRecipe;
  sourceTitle?: string | null;
  stepImages?: string[];
  imageUrl?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const rateLimit = await checkDailyImportLimit();
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { data: null, error: rateLimitErrorMessage(rateLimit) },
        { status: rateLimit.userId ? 429 : 401 }
      );
    }

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

    // Flatten sections → ingredients and steps for backward-compat DB columns
    const sections = recipe.sections ?? [];
    const allIngredients = sections.flatMap((s) => s.ingredients);
    const allSteps = sections
      .flatMap((s) => s.steps)
      .map((s, i) => ({ ...s, order: i + 1 }));

    const { data: insertData, error: dbError } = await supabaseAdmin
      .from("recipes")
      .insert({
        title: recipe.title,
        servings: recipe.servings,
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        recipe_type: recipe.recipe_type ?? "kochen",
        sections,
        ingredients: allIngredients,
        steps: allSteps,
        tags: recipe.tags,
        source_type: recipe.source.type,
        source_value: recipe.source.value,
        source_title: sourceTitle ?? null,
        description: null,
        image_url: imageUrl ?? null,
        step_images: stepImages,
        scalable: recipe.scalable ?? true,
        user_id: user?.id ?? null,
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
