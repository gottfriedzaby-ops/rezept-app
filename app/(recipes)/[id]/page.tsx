import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import RecipeDetail from "@/components/RecipeDetail";
import RecipeCover from "@/components/RecipeCover";
import { getTagColor } from "@/lib/tag-colors";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .single();

  const recipe = data as Recipe | null;
  if (!recipe) notFound();

  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <div className="min-h-screen bg-surface-primary">
      {/* Hero cover — full width */}
      <RecipeCover
        imageUrl={recipe.image_url}
        title={recipe.title}
        tags={recipe.tags}
        variant="hero"
      />

      {/* Content column */}
      <div className="max-w-[720px] mx-auto px-8 py-10">
        <Link
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Alle Rezepte
        </Link>

        <h1 className="font-serif text-[2rem] font-medium text-ink-primary tracking-[-0.02em] leading-tight mb-5">
          {recipe.title}
        </h1>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary mb-4">
          {recipe.prep_time ? <span>Vorbereitung {recipe.prep_time} Min.</span> : null}
          {recipe.cook_time ? <span>Kochen {recipe.cook_time} Min.</span> : null}
          {totalTime > 0 ? (
            <span className="text-ink-primary font-medium">Gesamt {totalTime} Min.</span>
          ) : null}
          {recipe.servings ? <span>{recipe.servings} Portionen</span> : null}
        </div>

        {recipe.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-4">
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
        )}

        {recipe.source_type === "url" && (
          <a
            href={recipe.source_value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-ink-tertiary hover:text-ink-primary transition-colors"
          >
            {recipe.source_title ?? recipe.source_value}
          </a>
        )}

        <RecipeDetail recipe={recipe} />
      </div>
    </div>
  );
}
