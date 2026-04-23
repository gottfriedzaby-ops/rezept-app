import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

// One-time migration: normalises tags on all existing recipes.
// DELETE THIS ROUTE after running it once.
export async function POST() {
  try {
    const { data: recipes, error: fetchError } = await supabaseAdmin
      .from("recipes")
      .select("id, title, tags");

    if (fetchError) throw fetchError;
    if (!recipes || recipes.length === 0) {
      return NextResponse.json({ updated: 0, message: "Keine Rezepte gefunden" });
    }

    let updated = 0;
    const changes: Array<{ id: string; title: string; before: string[]; after: string[] }> = [];

    for (const recipe of recipes) {
      const before: string[] = recipe.tags ?? [];
      const after = normalizeTags(before);

      const changed =
        before.length !== after.length ||
        before.some((t: string, i: number) => t !== after[i]);

      if (changed) {
        const { error: updateError } = await supabaseAdmin
          .from("recipes")
          .update({ tags: after })
          .eq("id", recipe.id);

        if (updateError) {
          console.error(`[normalize-tags] failed to update ${recipe.id}:`, updateError);
        } else {
          updated++;
          changes.push({ id: recipe.id, title: recipe.title, before, after });
        }
      }
    }

    return NextResponse.json({
      total: recipes.length,
      updated,
      changes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
