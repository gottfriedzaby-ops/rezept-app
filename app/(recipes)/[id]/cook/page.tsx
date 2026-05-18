import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import CookMode from "@/components/CookMode";

export const dynamic = "force-dynamic";

export default async function CookPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { servings?: string };
}) {
  const { data } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", params.id)
    .single();

  const recipe = data as Recipe | null;
  if (!recipe) notFound();

  // FR-90: when no ?servings= param is present, default to the recipe's stored
  // serving count rather than 1 — otherwise the ingredient drawer renders
  // per-portion amounts as totals for 1 person.
  const fallback = recipe.servings ?? 1;
  const parsed = parseInt(searchParams.servings ?? String(fallback), 10);
  const servings = Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);

  return <CookMode recipe={recipe} initialServings={servings} />;
}
