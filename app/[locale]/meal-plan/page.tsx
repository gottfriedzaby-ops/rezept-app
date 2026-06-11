import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { addDays, getWeekStart, isValidIsoDate, snapToWeekStart } from "@/lib/meal-plan";
import MealPlanWeek from "@/components/MealPlanWeek";
import UserNav from "@/components/UserNav";
import type { MealPlanEntryWithRecipe, MealPlanRecipe } from "@/types/meal-plan";

export const dynamic = "force-dynamic";

const RECIPE_COLUMNS = "id, title, image_url, recipe_type, servings, tags, ingredients, sections";

export default async function MealPlanPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/meal-plan");

  const [t, tCommon] = await Promise.all([
    getTranslations("MealPlan"),
    getTranslations("Common"),
  ]);

  const weekStart =
    searchParams.week && isValidIsoDate(searchParams.week)
      ? snapToWeekStart(searchParams.week)
      : getWeekStart();

  const [entriesResult, recipesResult] = await Promise.all([
    supabaseAdmin
      .from("meal_plan_entries")
      .select(`*, recipe:recipes(${RECIPE_COLUMNS})`)
      .eq("user_id", user.id)
      .gte("date", weekStart)
      .lt("date", addDays(weekStart, 7))
      .order("date", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("recipes")
      .select(RECIPE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (entriesResult.error) {
    if (entriesResult.error.code === "42P01") {
      // Migration not applied yet — render an empty week instead of crashing.
      console.warn(
        "[meal-plan] Tabelle 'meal_plan_entries' fehlt — Migration 20260611000001_feature16_meal_plan.sql ausführen."
      );
    } else {
      console.error("[meal-plan] entries query failed:", entriesResult.error.message);
    }
  }

  const entries = ((entriesResult.data ?? []) as MealPlanEntryWithRecipe[]).filter(
    (entry) => entry.recipe !== null
  );
  const recipes = (recipesResult.data ?? []) as MealPlanRecipe[];

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-10 sm:py-16">
        <header className="mb-10 flex items-center justify-between gap-3">
          <div>
            <Link
              href="/"
              className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-4"
            >
              {tCommon("allRecipes")}
            </Link>
            <h1 className="font-serif text-3xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em]">
              {t("title")}
            </h1>
          </div>
          <UserNav />
        </header>

        <MealPlanWeek weekStart={weekStart} entries={entries} recipes={recipes} />
      </div>
    </div>
  );
}
