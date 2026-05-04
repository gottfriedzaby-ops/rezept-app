export interface Ingredient {
  amount: number;
  unit: string;
  name: string;
}

export interface Step {
  order: number;
  text: string;
  timerSeconds: number | null;
}

export type RecipeType = "kochen" | "backen" | "grillen" | "zubereiten";

export interface RecipeSection {
  title: string | null;
  ingredients: Ingredient[];
  steps: Step[];
}

export type SourceType = "url" | "photo" | "youtube" | "instagram" | "manual";

export interface Recipe {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  recipe_type: RecipeType;
  ingredients: Ingredient[];
  steps: Step[];
  sections: RecipeSection[] | null;
  tags: string[];
  source_type: SourceType;
  source_value: string;
  source_title: string | null;
  image_url: string | null;
  step_images: string[] | null;
  favorite: boolean;
  scalable: boolean | null;
}

export interface ImportJob {
  id: string;
  created_at: string;
  status: "pending" | "processing" | "done" | "error";
  source_type: SourceType;
  source_value: string;
  error_msg: string | null;
  recipe_id: string | null;
}

export interface ParsedRecipe {
  title: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  recipe_type: RecipeType;
  sections: RecipeSection[];
  tags: string[];
  source: { type: SourceType; value: string };
  scalable?: boolean;
}

export function getRecipeSections(recipe: Recipe): RecipeSection[] {
  if (recipe.sections && recipe.sections.length > 0) return recipe.sections;
  return [{ title: null, ingredients: recipe.ingredients, steps: recipe.steps }];
}
