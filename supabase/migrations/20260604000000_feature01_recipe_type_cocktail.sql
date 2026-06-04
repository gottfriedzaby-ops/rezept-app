-- Feature 01 (extension): add 'cocktail' as a fifth recipe_type
--
-- recipe_type was introduced directly in the Supabase dashboard (it predates the
-- migration history), so its CHECK constraint — which limited values to
-- ('kochen','backen','grillen','zubereiten') — lives in the database but not in
-- any migration file. This migration widens that constraint to also allow
-- 'cocktail'.
--
-- It mirrors 20260512000000_feature10_pdf_source_type.sql: because the existing
-- constraint may have been created inline (auto-named) or explicitly, we look it
-- up dynamically by its definition and drop it before re-adding the widened one.
--
-- The ADD COLUMN IF NOT EXISTS guard keeps the migration self-contained, so it
-- also succeeds on a database where recipe_type was never created (e.g. a fresh
-- environment provisioned from migrations alone). Existing rows keep their value;
-- new/blank rows default to 'kochen'.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS recipe_type text NOT NULL DEFAULT 'kochen';

DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'recipes'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%recipe_type%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE recipes DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE recipes
  ADD CONSTRAINT recipes_recipe_type_check
  CHECK (recipe_type IN ('kochen', 'backen', 'grillen', 'zubereiten', 'cocktail'));

-- Optional index for future "filter by type" browsing (FR-01-8).
CREATE INDEX IF NOT EXISTS recipes_recipe_type_idx ON recipes (recipe_type);
