import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import ImportTabs from "@/components/ImportTabs";
import RecipeList from "@/components/RecipeList";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { data: recipes } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Recipe[]>();

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-8 py-16">

        <header className="mb-16">
          <h1 className="font-serif text-5xl font-medium text-ink-primary tracking-[-0.02em] leading-tight">
            Meine Rezepte
          </h1>
        </header>

        <section className="mb-16">
          <p className="label-overline mb-8">Rezept importieren</p>
          <div className="max-w-lg">
            <ImportTabs />
          </div>
        </section>

        <section>
          <p className="label-overline mb-8">Alle Rezepte</p>
          {!recipes || recipes.length === 0 ? (
            <p className="text-ink-secondary">
              Noch keine Rezepte. Importiere das erste!
            </p>
          ) : (
            <RecipeList recipes={recipes} />
          )}
        </section>

      </div>
    </div>
  );
}
