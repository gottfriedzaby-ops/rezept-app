-- Feature 19: Nutrition tracking (Ernährungstagebuch + Ziele)
-- Yazio-style food diary + personalized calorie/macro goals.
-- Prerequisite: Feature 05 (auth) applied; recipes table exists.
-- Run manually in the Supabase SQL editor — code degrades gracefully (42P01)
-- until then.

-- ─── nutrition_profiles ──────────────────────────────────────────────────────
-- Body data + the user's daily calorie/macro budget. One row per user.
-- target_* are computed from the body data (Mifflin-St Jeor → TDEE → goal) on
-- every profile save unless manual_targets is set.
CREATE TABLE IF NOT EXISTS nutrition_profiles (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  sex               text        NOT NULL CHECK (sex IN ('male', 'female', 'diverse')),
  birth_date        date        NOT NULL,
  height_cm         numeric     NOT NULL CHECK (height_cm BETWEEN 50 AND 280),
  weight_kg         numeric     NOT NULL CHECK (weight_kg BETWEEN 20 AND 500),
  activity_level    text        NOT NULL CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal              text        NOT NULL CHECK (goal IN ('lose', 'maintain', 'gain')),
  target_kcal       integer     CHECK (target_kcal BETWEEN 0 AND 20000),
  target_protein_g  integer     CHECK (target_protein_g BETWEEN 0 AND 2000),
  target_carbs_g    integer     CHECK (target_carbs_g BETWEEN 0 AND 2000),
  target_fat_g      integer     CHECK (target_fat_g BETWEEN 0 AND 2000),
  -- true = user typed the targets directly; skip the auto-recompute on save
  manual_targets    boolean     NOT NULL DEFAULT false
);

DROP TRIGGER IF EXISTS nutrition_profiles_updated_at ON nutrition_profiles;
CREATE TRIGGER nutrition_profiles_updated_at
  BEFORE UPDATE ON nutrition_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE nutrition_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY nutrition_profiles_owner ON nutrition_profiles
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── food_log_entries ────────────────────────────────────────────────────────
-- The diary. Each row stores a per-serving nutrition SNAPSHOT plus a servings
-- multiplier, so the entry total (kcal_per_serving * servings) stays stable even
-- if the source recipe is later edited or deleted (recipe_id is ON DELETE SET
-- NULL, not CASCADE — diary history must survive recipe deletion).
CREATE TABLE IF NOT EXISTS food_log_entries (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id         uuid        REFERENCES recipes(id) ON DELETE SET NULL,
  date              date        NOT NULL,
  meal_slot         text        NOT NULL CHECK (meal_slot IN ('fruehstueck', 'mittag', 'abend', 'snacks')),
  source            text        NOT NULL DEFAULT 'manual' CHECK (source IN ('recipe', 'manual', 'photo')),
  label             text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  servings          numeric     NOT NULL DEFAULT 1 CHECK (servings > 0 AND servings <= 100),
  kcal_per_serving  numeric     NOT NULL DEFAULT 0 CHECK (kcal_per_serving >= 0),
  protein_g         numeric     NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g           numeric     NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g             numeric     NOT NULL DEFAULT 0 CHECK (fat_g >= 0)
);

CREATE INDEX IF NOT EXISTS food_log_entries_user_date_idx ON food_log_entries (user_id, date);
CREATE INDEX IF NOT EXISTS food_log_entries_recipe_idx    ON food_log_entries (recipe_id);

ALTER TABLE food_log_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY food_log_entries_owner ON food_log_entries
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
