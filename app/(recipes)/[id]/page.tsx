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
import { recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
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

  // FR-89: derive a compact provenance label per source type.
  // URL/YouTube/Instagram → clickable link with domain.
  // Photo/PDF/Manual → non-clickable label.
  const sourceDisplay = (() => {
    if (recipe.source_type === "url") {
      let host = recipe.source_value;
      try { host = new URL(recipe.source_value).hostname.replace(/^www\./, ""); } catch { /* not a parseable URL */ }
      return { href: recipe.source_value, label: host };
    }
    if (recipe.source_type === "youtube") {
      return {
        href: `https://www.youtube.com/watch?v=${recipe.source_value}`,
        label: "youtube.com",
      };
    }
    if (recipe.source_type === "instagram") {
      return {
        href: `https://www.instagram.com/p/${recipe.source_value}`,
        label: "instagram.com",
      };
    }
    if (recipe.source_type === "photo") return { href: null, label: "Foto" };
    if (recipe.source_type === "pdf") return { href: null, label: "PDF" };
    return { href: null, label: "Manuell" };
  })();

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

        {/* FR-89: provenance directly under title, above the portion selector.
            BR-02 ("Provenance non-negotiable") makes this above-the-fold. */}
        <p className="text-sm text-ink-secondary mb-4">
          {sourceDisplay.href ? (
            <a
              href={sourceDisplay.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink-primary transition-colors"
            >
              Quelle: {sourceDisplay.label} →
            </a>
          ) : (
            <span>Quelle: {sourceDisplay.label}</span>
          )}
        </p>

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

        {/* RecipeDetail owns the meta-row + portion-stepper because the "X Portionen" cell
            in the meta-row syncs with the scaler state (FR-81). */}
        <RecipeDetail recipe={recipe} />

        <NutritionDisplay recipe={recipe} />

        <div className="mt-8 pt-8 border-t border-stone">
          <AddToShoppingListButton recipe={recipe} />
        </div>
      </div>
    </div>
  );
}
