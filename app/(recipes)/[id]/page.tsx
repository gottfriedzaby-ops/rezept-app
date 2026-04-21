import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import RecipeDetail from "@/components/RecipeDetail";

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
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <Link href="/" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
        ← Alle Rezepte
      </Link>

      <h1 className="text-3xl font-bold mb-2">{recipe.title}</h1>

      {recipe.source_type === "url" && (
        <a
          href={recipe.source_value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:underline mb-4 inline-block"
        >
          {recipe.source_title ?? recipe.source_value}
        </a>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 mt-4">
        {recipe.prep_time ? <span>Vorbereitung: {recipe.prep_time} Min.</span> : null}
        {recipe.cook_time ? <span>Kochen: {recipe.cook_time} Min.</span> : null}
        {totalTime > 0 ? <span className="font-medium">Gesamt: {totalTime} Min.</span> : null}
      </div>

      {recipe.tags.length > 0 && (
        <div className="flex gap-1 mt-4 flex-wrap">
          {recipe.tags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      <RecipeDetail recipe={recipe} />
    </main>
  );
}
