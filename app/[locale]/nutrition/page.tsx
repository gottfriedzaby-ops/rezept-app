import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidIsoDate } from "@/lib/meal-plan";
import NutritionDashboard from "@/components/nutrition/NutritionDashboard";
import UserNav from "@/components/UserNav";
import type {
  FoodLogEntry,
  NutritionProfile,
  NutritionRecipeItem,
} from "@/types/nutrition";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const RECIPE_COLUMNS =
  "id, title, recipe_type, servings, kcal_per_serving, protein_g, carbs_g, fat_g";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/nutrition");

  const [t, tCommon] = await Promise.all([
    getTranslations("Nutrition"),
    getTranslations("Common"),
  ]);

  const today = todayIso();
  const date =
    searchParams.date && isValidIsoDate(searchParams.date) ? searchParams.date : today;

  const [profileResult, entriesResult, recipesResult] = await Promise.all([
    supabaseAdmin.from("nutrition_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabaseAdmin
      .from("food_log_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", date)
      .order("meal_slot", { ascending: true })
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("recipes")
      .select(RECIPE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error && profileResult.error.code === RELATION_MISSING) {
    console.warn(
      "[nutrition] Tabelle 'nutrition_profiles' fehlt — Migration 20260615000000_feature19_nutrition_tracking.sql ausführen."
    );
  }
  if (entriesResult.error && entriesResult.error.code === RELATION_MISSING) {
    console.warn(
      "[nutrition] Tabelle 'food_log_entries' fehlt — Migration 20260615000000_feature19_nutrition_tracking.sql ausführen."
    );
  }

  const profile = (profileResult.error ? null : profileResult.data) as NutritionProfile | null;
  const entries = (entriesResult.data ?? []) as FoodLogEntry[];
  const recipes = (recipesResult.data ?? []) as NutritionRecipeItem[];

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
            <h1 className="font-serif text-2xl sm:text-4xl font-medium text-ink-primary tracking-[-0.02em]">
              {t("title")}
            </h1>
          </div>
          <UserNav />
        </header>

        <NutritionDashboard
          date={date}
          todayIso={today}
          profile={profile}
          entries={entries}
          recipes={recipes}
        />
      </div>
    </div>
  );
}
