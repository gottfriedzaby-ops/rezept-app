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

  const servings = Math.max(1, parseInt(searchParams.servings ?? "1", 10) || 1);

  return <CookMode recipe={recipe} initialServings={servings} />;
}
