import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfilesByIds, profileDisplayName } from "@/lib/profiles";
import {
  getSharedOwnerIds,
  parseSort,
  searchRecipes,
} from "@/lib/recipe-search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const offsetRaw = Number.parseInt(sp.get("offset") ?? "0", 10);
  const limitRaw = Number.parseInt(sp.get("limit") ?? "", 10);

  try {
    const sharedOwnerIds = await getSharedOwnerIds(user.id);
    const result = await searchRecipes(user.id, sharedOwnerIds, {
      q: sp.get("q") ?? undefined,
      tags: sp.getAll("tag"),
      favoritesOnly: sp.get("fav") === "1",
      sort: parseSort(sp.get("sort")),
      offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
      limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
    });

    // Attach owner display names to recipes from shared libraries
    const foreignOwnerIds = result.recipes
      .map((r) => r.user_id)
      .filter((id): id is string => Boolean(id) && id !== user.id);
    const profiles = await getProfilesByIds(foreignOwnerIds);

    const recipes = result.recipes.map((recipe) =>
      recipe.user_id && recipe.user_id !== user.id
        ? {
            ...recipe,
            _ownerName: profileDisplayName(profiles.get(recipe.user_id), recipe.user_id),
          }
        : recipe
    );

    return NextResponse.json({
      data: { ...result, recipes },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suche fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
