import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProfilesByIds, profileDisplayName } from "@/lib/profiles";
import { getCollectionsWithCounts } from "@/lib/collections";
import {
  getSharedOwnerIds,
  getVisibleTags,
  parseSort,
  searchRecipes,
} from "@/lib/recipe-search";
import CollectionsStrip from "@/components/CollectionsStrip";
import ImportTabs from "@/components/ImportTabs";
import RecipeList from "@/components/RecipeList";
import RecipeListSkeleton from "@/components/RecipeListSkeleton";
import UserNav from "@/components/UserNav";

export const dynamic = "force-dynamic";

interface RecipesPageSearchParams {
  q?: string;
  tag?: string | string[];
  fav?: string;
  sort?: string;
}

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: RecipesPageSearchParams;
}) {
  const t = await getTranslations("RecipeList");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeTags =
    typeof searchParams.tag === "string"
      ? [searchParams.tag]
      : searchParams.tag ?? [];

  const sharedOwnerIds = await getSharedOwnerIds(user.id);
  const [result, allTags, collections] = await Promise.all([
    searchRecipes(user.id, sharedOwnerIds, {
      q: searchParams.q,
      tags: activeTags,
      favoritesOnly: searchParams.fav === "1",
      sort: parseSort(searchParams.sort),
      offset: 0,
    }),
    getVisibleTags(user.id, sharedOwnerIds),
    getCollectionsWithCounts(user.id),
  ]);

  // Attach owner display names to recipes from shared libraries
  const foreignOwnerIds = result.recipes
    .map((r) => r.user_id)
    .filter((id): id is string => Boolean(id) && id !== user.id);
  const profiles = await getProfilesByIds(foreignOwnerIds);
  const recipes = result.recipes.map((recipe) =>
    recipe.user_id && recipe.user_id !== user.id
      ? {
          ...recipe,
          _ownerName: profileDisplayName(profiles.get(recipe.user_id), t("unknownOwner")),
        }
      : recipe
  );

  const hasActiveFilter =
    Boolean(searchParams.q) || activeTags.length > 0 || searchParams.fav === "1";
  const libraryIsEmpty = result.total === 0 && !hasActiveFilter;

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">

        <header className="mb-12 sm:mb-16 flex items-center justify-between gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl font-medium text-ink-primary tracking-[-0.02em] leading-tight">
            {t("pageTitle")}
          </h1>
          <UserNav />
        </header>

        <section className="mb-16">
          <p className="label-overline mb-8">{t("importSection")}</p>
          <div className="max-w-lg">
            <ImportTabs />
          </div>
        </section>

        {collections.length > 0 && (
          <section className="mb-16">
            <CollectionsStrip collections={collections} />
          </section>
        )}

        <section>
          <p className="label-overline mb-8">{t("allRecipesSection")}</p>
          {libraryIsEmpty ? (
            <p className="text-ink-secondary">
              {t("emptyState")}
            </p>
          ) : (
            <Suspense fallback={<RecipeListSkeleton />}>
              <RecipeList
                recipes={recipes}
                serverSearch
                allTags={allTags}
                initialTotal={result.total}
              />
            </Suspense>
          )}
        </section>

      </div>
    </div>
  );
}
