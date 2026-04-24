import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import RecipeEditForm from "@/components/RecipeEditForm";

export const dynamic = "force-dynamic";

export default async function RecipeEditPage({ params }: { params: { id: string } }) {
  const { data } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .single();

  const recipe = data as Recipe | null;
  if (!recipe) notFound();

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-10">
        <Link
          href={`/${recipe.id}`}
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Zurück zum Rezept
        </Link>

        <h1 className="font-serif text-[2rem] font-medium text-ink-primary tracking-[-0.02em] leading-tight mb-8">
          Rezept bearbeiten
        </h1>

        <RecipeEditForm recipe={recipe} />
      </div>
    </div>
  );
}
