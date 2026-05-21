import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import CookMode from "@/components/CookMode";
import { resolveCookServings } from "@/lib/cookServings";

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

  const servings = resolveCookServings(searchParams.servings, recipe.servings);

  return <CookMode recipe={recipe} initialServings={servings} />;
}
