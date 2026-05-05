-- Feature 08: Nutrition Calculation
-- Adds per-serving calorie and macro columns to the recipes table.
-- All columns are nullable; existing rows default to NULL until
-- nutrition is calculated via /api/recipes/[id]/nutrition.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS kcal_per_serving numeric,
  ADD COLUMN IF NOT EXISTS protein_g        numeric,
  ADD COLUMN IF NOT EXISTS carbs_g          numeric,
  ADD COLUMN IF NOT EXISTS fat_g            numeric,
  ADD COLUMN IF NOT EXISTS nutrition_breakdown jsonb DEFAULT NULL;
