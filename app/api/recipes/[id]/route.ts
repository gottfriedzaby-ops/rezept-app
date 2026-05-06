import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RecipeSection, Step } from "@/types/recipe";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

async function getUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title, description, servings, prep_time, cook_time,
      sections, recipe_type, ingredients, steps, tags, image_url, favorite, is_private,
    } = body;

    const update: Record<string, unknown> = {};
    if (title !== undefined)       update.title = title;
    if (description !== undefined) update.description = description;
    if (servings !== undefined)    update.servings = servings;
    if (prep_time !== undefined)   update.prep_time = prep_time;
    if (cook_time !== undefined)   update.cook_time = cook_time;
    if (recipe_type !== undefined) update.recipe_type = recipe_type;
    if (sections !== undefined) {
      update.sections = sections;
      // Keep flat columns in sync for backward compat
      update.ingredients = (sections as RecipeSection[]).flatMap((s) => s.ingredients);
      update.steps = (sections as RecipeSection[])
        .flatMap((s) => s.steps)
        .map((s: Step, i: number) => ({ ...s, order: i + 1 }));
    } else {
      // Legacy path: direct ingredient/step updates (e.g. from old clients)
      if (ingredients !== undefined) update.ingredients = ingredients;
      if (steps !== undefined)       update.steps = steps;
    }
    if (tags !== undefined)        update.tags = tags;
    if (image_url !== undefined)   update.image_url = image_url;
    if (favorite !== undefined)    update.favorite = favorite;
    if (is_private !== undefined)  update.is_private = is_private;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ data: null, error: "Keine Felder zum Aktualisieren" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("recipes")
      .update(update)
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aktualisierung fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
    }

    const { data: recipe } = await supabaseAdmin
      .from("recipes")
      .select("image_url")
      .eq("id", params.id)
      .single();

    if (recipe?.image_url) {
      const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/recipe-images/`;
      if (recipe.image_url.startsWith(storagePrefix)) {
        const path = recipe.image_url.slice(storagePrefix.length);
        await supabaseAdmin.storage.from("recipe-images").remove([path]);
      }
    }

    const { error } = await supabaseAdmin
      .from("recipes")
      .delete()
      .eq("id", params.id);

    if (error) throw error;
    return NextResponse.json({ data: null, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Löschen fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
