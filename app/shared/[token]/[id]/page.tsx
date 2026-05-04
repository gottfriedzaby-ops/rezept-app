import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import RecipeDetail from "@/components/RecipeDetail";
import RecipeCover from "@/components/RecipeCover";
import PdfExportButton from "@/components/PdfExportButton";
import RecipeExportMenu from "@/components/RecipeExportMenu";
import { getTagColor } from "@/lib/tag-colors";
import { cookTimeLabelFor, recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import { toSchemaOrgRecipe } from "@/lib/schemaOrg";

export const dynamic = "force-dynamic";

export default async function SharedRecipeDetailPage({
  params,
}: {
  params: { token: string; id: string };
}) {
  // Validate token
  const { data: share } = await supabaseAdmin
    .from("shares")
    .select("owner_id, revoked_at")
    .eq("token", params.token)
    .single();

  if (!share || share.revoked_at) {
    return (
      <div className="min-h-screen bg-surface-primary flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="font-serif text-2xl font-medium text-ink-primary mb-3">
            Dieser Link ist nicht mehr gültig
          </h1>
          <p className="text-ink-secondary text-sm">
            Der Einladungslink wurde widerrufen oder existiert nicht.
          </p>
        </div>
      </div>
    );
  }

  const { data } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", share.owner_id)
    .single();

  const recipe = data as Recipe | null;
  if (!recipe) notFound();

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <div className="min-h-screen bg-surface-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(toSchemaOrgRecipe(recipe)) }}
      />
      <RecipeCover
        imageUrl={recipe.image_url}
        title={recipe.title}
        tags={recipe.tags}
        variant="hero"
      />

      <div className="max-w-[720px] mx-auto px-8 py-10">
        <Link
          href={`/shared/${params.token}`}
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Alle Rezepte
        </Link>

        <div className="flex items-start justify-between gap-4 mb-5">
          <h1 className="font-serif text-[2rem] font-medium text-ink-primary tracking-[-0.02em] leading-tight">
            {recipe.title}
          </h1>
          <div className="flex items-center gap-0 -mr-1">
            <RecipeExportMenu recipe={recipe} />
            <PdfExportButton recipe={recipe} />
            {/* RecipeActions intentionally omitted — read-only view */}
          </div>
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

        <RecipeDetail recipe={recipe} />
      </div>
    </div>
  );
}
