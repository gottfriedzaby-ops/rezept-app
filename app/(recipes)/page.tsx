import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import ImportTabs from "@/components/ImportTabs";
import RecipeList from "@/components/RecipeList";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { data: recipes, error } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Recipe[]>();

  console.log("[RecipesPage] count:", recipes?.length ?? 0, "error:", error?.message ?? null);

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Meine Rezepte</h1>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">Rezept importieren</h2>
        <ImportTabs />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Alle Rezepte</h2>
        {!recipes || recipes.length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Rezepte. Importiere das erste!</p>
        ) : (
          <RecipeList recipes={recipes} />
        )}
      </section>
    </main>
  );
}
