-- Phase 2: shopping list cloud sync
-- Per-item rows with last-write-wins timestamps and deletion tombstones.
-- localStorage stays the offline source of truth on each device; the sync
-- endpoint merges by (user_id, id) using updated_at.

CREATE TABLE IF NOT EXISTS shopping_list_items (
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Client-generated uuid. Composite PK so one user can never touch another
  -- user's row via an id collision in the upsert.
  id              uuid        NOT NULL,
  recipe_id       text        NOT NULL,
  recipe_title    text        NOT NULL,
  ingredient_name text        NOT NULL,
  -- double precision (not numeric): PostgREST serialises numeric as a string,
  -- the client expects a JSON number
  amount          double precision,
  unit            text        NOT NULL DEFAULT '',
  checked         boolean     NOT NULL DEFAULT false,
  manual          boolean     NOT NULL DEFAULT false,
  added_at        timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL,
  deleted_at      timestamptz,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS shopping_list_items_user_updated_idx
  ON shopping_list_items (user_id, updated_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY shopping_list_items_owner ON shopping_list_items
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
