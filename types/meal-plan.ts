import type { Ingredient, RecipeSection, RecipeType } from "@/types/recipe";

export type MealSlot = "fruehstueck" | "mittag" | "abend";

export const MEAL_SLOTS: readonly MealSlot[] = ["fruehstueck", "mittag", "abend"] as const;

export interface MealPlanEntry {
  id: string;
  created_at: string;
  user_id: string;
  recipe_id: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  meal_slot: MealSlot;
  /** NULL = use the recipe's own serving count */
  servings: number | null;
}

/** Recipe columns joined onto a meal-plan entry for display + shopping list. */
export interface MealPlanRecipe {
  id: string;
  title: string;
  image_url: string | null;
  recipe_type: RecipeType | null;
  servings: number | null;
  tags: string[];
  ingredients: Ingredient[];
  sections: RecipeSection[] | null;
}

export interface MealPlanEntryWithRecipe extends MealPlanEntry {
  recipe: MealPlanRecipe;
}
