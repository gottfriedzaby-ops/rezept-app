import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { categorizeIngredients } from "@/lib/claude";
import {
  categorizeIngredientLocal,
  normalizeIngredientName,
  type CategoryId,
} from "@/lib/ingredient-categories";
import { getSharedCategories, saveSharedCategories } from "@/lib/ingredient-categories-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Max ingredient names accepted per request. The client only sends names the
// static keyword map can't place; this caps the rare Claude calls.
const MAX_NAMES = 50;

// Resolve uncategorized ingredient names to supermarket aisles, layering:
//   1. static keyword map (instant, in lib/ingredient-categories.ts)
//   2. shared cross-user table (one Claude lookup benefits everyone)
//   3. Claude (claude-haiku-4-5) for names new to the whole system, whose
//      answers are then persisted to the shared table.
// Returns a map keyed by the EXACT names that were sent (the client normalizes).
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
    const requested = Array.isArray(body?.names)
      ? (body.names as unknown[])
          .filter((n): n is string => typeof n === "string")
          .slice(0, MAX_NAMES)
      : [];

    if (requested.length === 0) {
      return NextResponse.json({ data: {}, error: null });
    }

    const result: Record<string, CategoryId> = {};
    // normalized name -> first original name that produced it
    const originalByNorm = new Map<string, string>();

    for (const name of requested) {
      const local = categorizeIngredientLocal(name);
      if (local) {
        result[name] = local;
        continue;
      }
      const norm = normalizeIngredientName(name);
      if (norm && !originalByNorm.has(norm)) originalByNorm.set(norm, name);
    }

    // 1) Shared, cross-user table.
    const shared = await getSharedCategories(Array.from(originalByNorm.keys()));
    const unknownOriginals: string[] = [];
    originalByNorm.forEach((original, norm) => {
      const hit = shared[norm];
      if (hit) result[original] = hit;
      else unknownOriginals.push(original);
    });

    // 2) Still unknown → ask Claude once, then persist for every user.
    if (unknownOriginals.length > 0) {
      const learned = await categorizeIngredients(unknownOriginals, user.id);
      const toPersist: Record<string, CategoryId> = {};
      for (const [name, category] of Object.entries(learned)) {
        result[name] = category;
        toPersist[normalizeIngredientName(name)] = category;
      }
      if (Object.keys(toPersist).length > 0) {
        await saveSharedCategories(toPersist);
      }
    }

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kategorisierung fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
