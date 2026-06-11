-- Feature 17: Discovery — ratings, personal notes, cooked counter, collections
-- Prerequisite: Feature 05 (auth) applied; recipes table exists.

-- ─── recipes: rating / notes / cooked tracking ───────────────────────────────
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS rating integer
  CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cooked_count integer NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS last_cooked_at timestamptz;

CREATE INDEX IF NOT EXISTS recipes_rating_idx ON recipes (user_id, rating DESC NULLS LAST);

-- ─── collections ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS collections_user_idx ON collections (user_id);

CREATE TABLE IF NOT EXISTS collection_recipes (
  collection_id uuid        NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id     uuid        NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS collection_recipes_recipe_idx ON collection_recipes (recipe_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY collections_owner ON collections
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE collection_recipes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY collection_recipes_owner ON collection_recipes
    FOR ALL
    USING (EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM collections c
      WHERE c.id = collection_id AND c.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
