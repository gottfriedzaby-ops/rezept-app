import type { MealSlot } from "@/types/meal-plan";
import type {
  ActivityLevel,
  Goal,
  NutritionTargets,
  Sex,
} from "@/lib/nutrition-goals";

export type { ActivityLevel, Goal, Sex, NutritionTargets };

/** Diary meal slots = meal-plan slots plus a dedicated snacks slot. */
export type LogMealSlot = MealSlot | "snacks";
export const LOG_MEAL_SLOTS: readonly LogMealSlot[] = [
  "fruehstueck",
  "mittag",
  "abend",
  "snacks",
] as const;

export type LogSource = "recipe" | "manual" | "photo";

export interface NutritionProfile {
  user_id: string;
  created_at: string;
  updated_at: string;
  sex: Sex;
  /** ISO date YYYY-MM-DD */
  birth_date: string;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  manual_targets: boolean;
}

export interface FoodLogEntry {
  id: string;
  created_at: string;
  user_id: string;
  recipe_id: string | null;
  /** ISO date YYYY-MM-DD */
  date: string;
  meal_slot: LogMealSlot;
  source: LogSource;
  label: string;
  /** Portions eaten — entry total = per-serving value × servings. */
  servings: number;
  kcal_per_serving: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MacroTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Recipe summary used by the diary's recipe picker. */
export interface NutritionRecipeItem {
  id: string;
  title: string;
  recipe_type: import("@/types/recipe").RecipeType | null;
  kcal_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  servings: number | null;
}

/** Response shape of GET /api/nutrition/log?date=. */
export interface DailyLog {
  date: string;
  entries: FoodLogEntry[];
  totals: MacroTotals;
  target: MacroTotals | null;
  remaining: MacroTotals | null;
}
