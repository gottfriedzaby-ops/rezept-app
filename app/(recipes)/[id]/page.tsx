import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Recipe } from "@/types/recipe";
import RecipeDetail from "@/components/RecipeDetail";
import AddToShoppingListButton from "@/components/AddToShoppingListButton";
import RecipeCover from "@/components/RecipeCover";
import RecipeActions from "@/components/RecipeActions";
import PdfExportButton from "@/components/PdfExportButton";
import RecipeExportMenu from "@/components/RecipeExportMenu";
import NutritionDisplay from "@/components/NutritionDisplay";
import PrivacyToggle from "@/components/PrivacyToggle";
import { getTagColor } from "@/lib/tag-colors";
import { cookTimeLabelFor, recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import { toSchemaOrgRecipe } from "@/lib/schemaOrg";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [{ data }, supabase] = await Promise.all([
    supabaseAdmin.from("recipes").select("*").eq("id", params.id).single(),
    createSupabaseServerClient(),
  ]);
  const { data: { user } } = await supabase.auth.getUser();

  const recipe = data as Recipe | null;
  if (!recipe) notFound();

  const isOwner = user?.id === recipe.user_id;

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <div className="min-h-screen bg-surface-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toSchemaOrgRecipe(recipe)) }}
      />
      {/* Hero cover — full width */}
      <RecipeCover
        imageUrl={recipe.image_url}
        title={recipe.title}
        tags={recipe.tags}
        variant="hero"
      />

      {/* Content column */}
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-10">
        <Link
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Alle Rezepte
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-5">
          <h1 className={[
            "font-serif font-medium text-ink-primary tracking-[-0.02em] leading-tight break-words hyphens-auto min-w-0",
            recipe.title.length > 60
              ? "text-xl sm:text-2xl md:text-[2rem]"
              : recipe.title.length > 30
              ? "text-2xl sm:text-[2rem]"
              : "text-[2rem]",
          ].join(" ")}>
            {recipe.title}
          </h1>
          <div className="flex items-center gap-1 shrink-0 -ml-1 sm:ml-0 sm:-mr-1 justify-end sm:justify-start">
            <RecipeExportMenu recipe={recipe} />
            <PdfExportButton recipe={recipe} />
            <RecipeActions recipeId={recipe.id} initialFavorite={recipe.favorite ?? false} />
          </div>
          {isOwner && (
            <div className="mt-2">
              <PrivacyToggle recipeId={recipe.id} initialIsPrivate={recipe.is_private} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary mb-4">
          {recipe.prep_time ? <span>Vorbereitung {recipe.prep_time} Min.</span> : null}
          {recipe.cook_time ? (
            <span>{cookTimeLabelFor(recipe.recipe_type ?? "kochen")} {recipe.cook_time} Min.</span>
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

        {recipe.source_type === "youtube" && (
          <a
            href={`https://www.youtube.com/watch?v=${recipe.source_value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ink-tertiary hover:text-ink-primary transition-colors"
          >
            {recipe.source_title ? `YouTube · ${recipe.source_title}` : "YouTube"}
          </a>
        )}

        {recipe.source_type === "instagram" && (
          <a
            href={`https://www.instagram.com/p/${recipe.source_value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ink-tertiary hover:text-ink-primary transition-colors"
          >
            {recipe.source_title ? `Instagram · @${recipe.source_title}` : "Instagram"}
          </a>
        )}

        <RecipeDetail recipe={recipe} />

        <NutritionDisplay recipe={recipe} />

        <div className="mt-8 pt-8 border-t border-stone">
          <AddToShoppingListButton recipe={recipe} />
        </div>
      </div>
    </div>
  );
}
