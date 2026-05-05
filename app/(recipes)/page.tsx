import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";
import ImportTabs from "@/components/ImportTabs";
import RecipeList from "@/components/RecipeList";
import UserNav from "@/components/UserNav";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const query = supabaseAdmin
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });

  // Filter by owner when authenticated
  if (user) {
    query.eq("user_id", user.id);
  }

  const { data: recipes } = await query.returns<Recipe[]>();

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">

        <header className="mb-12 sm:mb-16 flex items-center justify-between gap-3">
          <h1 className="font-serif text-4xl sm:text-5xl font-medium text-ink-primary tracking-[-0.02em] leading-tight">
            Meine Rezepte
          </h1>
          <UserNav />
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
