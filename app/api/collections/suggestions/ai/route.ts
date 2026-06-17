import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  checkDailyAssistantLimit,
  assistantRateLimitErrorMessage,
} from "@/lib/assistant-rate-limit";
import {
  suggestThematicCollections,
  type ThematicRecipeInput,
} from "@/lib/collection-ai-suggestions";
import type { RecipeType } from "@/types/recipe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RecipeRow {
  id: string;
  title: string;
  tags: string[] | null;
  recipe_type: RecipeType | null;
}

// Hybrid-Pass: nutzerausgelöster KI-Vorschlag thematischer Sammlungen.
// Zählt gegen das tägliche Assistent-Limit (lib/assistant-rate-limit.ts).
export async function POST() {
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

  const { data: rows, error } = await supabaseAdmin
    .from("recipes")
    .select("id, title, tags, recipe_type")
    .eq("user_id", limit.userId)
    .order("created_at", { ascending: false })
    .limit(250)
    .returns<RecipeRow[]>();

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ data: { suggestions: [] }, error: null });
  }

  const { data: collections } = await supabaseAdmin
    .from("collections")
    .select("name")
    .eq("user_id", limit.userId);
  const existingNames = ((collections ?? []) as { name: string }[]).map((c) => c.name);

  const recipes: ThematicRecipeInput[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    tags: row.tags ?? [],
    recipe_type: row.recipe_type,
  }));

  try {
    const suggestions = await suggestThematicCollections(recipes, existingNames, limit.userId);
    return NextResponse.json({ data: { suggestions }, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: "Der Assistent ist gerade nicht erreichbar. Bitte versuche es erneut." },
      { status: 502 }
    );
  }
}
