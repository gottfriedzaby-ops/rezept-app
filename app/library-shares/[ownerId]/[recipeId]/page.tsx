import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import RecipeDetail from "@/components/RecipeDetail";
import RecipeCover from "@/components/RecipeCover";
import AddToShoppingListButton from "@/components/AddToShoppingListButton";
import NutritionDisplay from "@/components/NutritionDisplay";
import CopyToLibraryButton from "@/components/CopyToLibraryButton";
import { getTagColor } from "@/lib/tag-colors";
import { cookTimeLabelFor, recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import type { Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";

export default async function SharedRecipeDetailPage({
  params,
}: {
  params: { ownerId: string; recipeId: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/library-shares/${params.ownerId}/${params.recipeId}`);

  // Verify accepted share
  const { data: share } = await supabaseAdmin
    .from("library_shares")
    .select("id")
    .eq("owner_id", params.ownerId)
    .eq("recipient_id", user.id)
    .eq("status", "accepted")
    .maybeSingle();

  if (!share) notFound();

  const { data } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", params.recipeId)
    .eq("user_id", params.ownerId)
    .eq("is_private", false)
    .single();

  const recipe = data as Recipe | null;
  if (!recipe) notFound();

  const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(params.ownerId);
  const ownerName =
    (ownerData.user?.user_metadata?.full_name as string) ||
    ownerData.user?.email ||
    "Unbekannt";

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <div className="min-h-screen bg-surface-primary">
      <RecipeCover
        imageUrl={recipe.image_url}
        title={recipe.title}
        tags={recipe.tags}
        variant="hero"
      />

      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-10">
        <Link
          href={`/library-shares/${params.ownerId}`}
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Sammlung von {ownerName}
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-5">
          <h1
            className={[
              "font-serif font-medium text-ink-primary tracking-[-0.02em] leading-tight break-words hyphens-auto min-w-0",
              recipe.title.length > 60
                ? "text-xl sm:text-2xl md:text-[2rem]"
                : recipe.title.length > 30
                ? "text-2xl sm:text-[2rem]"
                : "text-[2rem]",
            ].join(" ")}
          >
            {recipe.title}
          </h1>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary mb-4">
          {recipe.prep_time ? <span>Vorbereitung {recipe.prep_time} Min.</span> : null}
          {recipe.cook_time ? (
            <span>
              {cookTimeLabelFor(recipe.recipe_type ?? "kochen")} {recipe.cook_time} Min.
            </span>
          ) : null}
          {totalTime > 0 ? (
            <span className="text-ink-primary font-medium">Gesamt {totalTime} Min.</span>
          ) : null}
          {recipe.servings ? <span>{recipe.servings} Portionen</span> : null}
        </div>

        <div className="flex gap-1.5 flex-wrap mb-4">
          {(() => {
            const badge = recipeTypeBadgeFor(recipe.recipe_type ?? "kochen");
            return (
              <span className="text-xs px-2.5 py-0.5 rounded bg-surface-secondary text-ink-secondary border border-stone">
                {badge.emoji} {badge.label}
              </span>
            );
          })()}
          {recipe.tags.map((tag) => {
            const { bg, text } = getTagColor(tag);
            return (
              <span
                key={tag}
                style={{ backgroundColor: bg, color: text }}
                className="text-xs px-2.5 py-0.5 rounded"
              >
                {tag}
              </span>
            );
          })}
        </div>

        {recipe.source_type === "url" && (
          <a
            href={recipe.source_value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ink-tertiary hover:text-ink-primary transition-colors"
          >
            {(recipe.source_title ?? recipe.source_value).slice(0, 120)}
          </a>
        )}

        <RecipeDetail recipe={recipe} />

        <NutritionDisplay recipe={recipe} />

        <div className="mt-8 pt-8 border-t border-stone space-y-4">
          <AddToShoppingListButton recipe={recipe} />
          <CopyToLibraryButton recipeId={recipe.id} />
        </div>
      </div>
    </div>
  );
}
