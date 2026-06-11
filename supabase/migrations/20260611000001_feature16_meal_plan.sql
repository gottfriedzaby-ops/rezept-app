-- Feature 16: Meal Planning (Wochenplan)
-- Prerequisite: Feature 05 (auth) applied; recipes table exists.

-- ─── meal_plan_entries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id  uuid        NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  date       date        NOT NULL,
  meal_slot  text        NOT NULL CHECK (meal_slot IN ('fruehstueck', 'mittag', 'abend')),
  -- NULL = use the recipe's own serving count
  servings   integer     CHECK (servings BETWEEN 1 AND 20),
  UNIQUE (user_id, date, meal_slot, recipe_id)
);

CREATE INDEX IF NOT EXISTS meal_plan_entries_user_date_idx ON meal_plan_entries (user_id, date);
CREATE INDEX IF NOT EXISTS meal_plan_entries_recipe_idx    ON meal_plan_entries (recipe_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE meal_plan_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY meal_plan_entries_owner ON meal_plan_entries
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
