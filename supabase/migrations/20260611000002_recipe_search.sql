-- Phase 2: server-side recipe search + pagination
-- Adds a trigger-maintained search_text column (substring search semantics
-- identical to the previous client-side filter: title + tags + ingredient
-- names + description) with a trigram GIN index, and a stored total_time
-- column so "sort by time" can happen in SQL.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── search_text ─────────────────────────────────────────────────────────────
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS search_text text;

CREATE OR REPLACE FUNCTION recipes_build_search_text(
  p_title text,
  p_description text,
  p_tags text[],
  p_ingredients jsonb,
  p_sections jsonb
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(concat_ws(' ',
    p_title,
    p_description,
    array_to_string(coalesce(p_tags, '{}'), ' '),
    (SELECT string_agg(elem->>'name', ' ')
       FROM jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) elem),
    (SELECT string_agg(ing->>'name', ' ')
       FROM jsonb_array_elements(coalesce(p_sections, '[]'::jsonb)) sec,
            jsonb_array_elements(coalesce(sec->'ingredients', '[]'::jsonb)) ing)
  ));
$$;

CREATE OR REPLACE FUNCTION recipes_search_text_sync()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := recipes_build_search_text(
    NEW.title, NEW.description, NEW.tags, NEW.ingredients, NEW.sections
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_search_text_sync ON recipes;
CREATE TRIGGER recipes_search_text_sync
  BEFORE INSERT OR UPDATE OF title, description, tags, ingredients, sections ON recipes
  FOR EACH ROW EXECUTE FUNCTION recipes_search_text_sync();

-- Backfill existing rows
UPDATE recipes SET search_text = recipes_build_search_text(
  title, description, tags, ingredients, sections
) WHERE search_text IS NULL;

CREATE INDEX IF NOT EXISTS recipes_search_text_trgm_idx
  ON recipes USING gin (search_text gin_trgm_ops);

-- ─── total_time (for ORDER BY in SQL) ────────────────────────────────────────
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS total_time integer
  GENERATED ALWAYS AS (coalesce(prep_time, 0) + coalesce(cook_time, 0)) STORED;
