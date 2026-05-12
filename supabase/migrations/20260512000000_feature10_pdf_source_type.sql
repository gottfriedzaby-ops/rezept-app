-- Feature 10: PDF Import — extend source_type CHECK constraint to allow 'pdf'
--
-- The original recipes.source_type CHECK constraint allowed only
-- ('url','photo','youtube','manual'). A previous migration extended it to
-- include 'instagram'. This migration adds 'pdf' so PDF imports can be saved
-- via /api/recipes/confirm without violating the constraint.
--
-- The current constraint name may vary depending on whether the constraint
-- was created inline or named explicitly. We look it up dynamically.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON c.conrelid = t.oid
  WHERE t.relname = 'recipes'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%source_type%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE recipes DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE recipes
  ADD CONSTRAINT recipes_source_type_check
  CHECK (source_type IN ('url', 'photo', 'youtube', 'instagram', 'manual', 'pdf'));
