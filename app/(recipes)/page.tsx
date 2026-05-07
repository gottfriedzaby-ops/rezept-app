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

  if (user) {
    query.eq("user_id", user.id);
  }

  const { data: recipes } = await query.returns<Recipe[]>();

  // Fetch shared recipes from accepted library shares
  let sharedRecipes: Array<Recipe & { _ownerName: string }> = [];

  if (user) {
    const { data: acceptedShares } = await supabaseAdmin
      .from("library_shares")
      .select("owner_id")
      .eq("recipient_id", user.id)
      .eq("status", "accepted");

    if (acceptedShares && acceptedShares.length > 0) {
      const ownerIds = acceptedShares.map((s) => s.owner_id);

      const [{ data: sharedRecipesRaw }, { data: settings }] = await Promise.all([
        supabaseAdmin
          .from("recipes")
          .select("*")
          .in("user_id", ownerIds)
          .eq("is_private", false)
          .order("created_at", { ascending: false })
          .returns<Recipe[]>(),
        supabaseAdmin
          .from("user_settings")
          .select("show_shared_in_main_library")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const showSharedInMainLibrary = settings?.show_shared_in_main_library ?? true;

      // Enrich with owner names
      const ownerNames = new Map<string, string>();
      await Promise.all(
        ownerIds.map(async (ownerId) => {
          const { data } = await supabaseAdmin.auth.admin.getUserById(ownerId);
          const name =
            (data.user?.user_metadata?.full_name as string) ||
            data.user?.email ||
            "Unbekannt";
          ownerNames.set(ownerId, name);
        })
      );

      if (showSharedInMainLibrary) {
        sharedRecipes = (sharedRecipesRaw ?? []).map((r) => ({
          ...r,
          _ownerName: ownerNames.get(r.user_id ?? "") ?? "Unbekannt",
        }));
      }
    }
  }

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
            <RecipeList
              recipes={recipes}
              sharedRecipes={sharedRecipes.length > 0 ? sharedRecipes : undefined}
            />
          )}
        </section>

      </div>
    </div>
  );
}
