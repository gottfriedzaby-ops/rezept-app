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

export type SourceType = "url" | "photo" | "youtube" | "manual";

export interface Recipe {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  source_type: SourceType;
  source_value: string;
  source_title: string | null;
  image_url: string | null;
  step_images: string[] | null;
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
  ingredients: Ingredient[];
  steps: Step[];
  tags: string[];
  source: { type: SourceType; value: string };
}
