import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const body = await request.json();
    const {
      title, description, servings, prep_time, cook_time,
      ingredients, steps, tags, image_url, favorite,
    } = body;

    const update: Record<string, unknown> = {};
    if (title !== undefined)       update.title = title;
    if (description !== undefined) update.description = description;
    if (servings !== undefined)    update.servings = servings;
    if (prep_time !== undefined)   update.prep_time = prep_time;
    if (cook_time !== undefined)   update.cook_time = cook_time;
    if (ingredients !== undefined) update.ingredients = ingredients;
    if (steps !== undefined)       update.steps = steps;
    if (tags !== undefined)        update.tags = tags;
    if (image_url !== undefined)   update.image_url = image_url;
    if (favorite !== undefined)    update.favorite = favorite;

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
    const { data: recipe } = await supabaseAdmin
      .from("recipes")
      .select("image_url")
      .eq("id", params.id)
      .single();

    // Remove image from Supabase Storage if it was uploaded there
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
