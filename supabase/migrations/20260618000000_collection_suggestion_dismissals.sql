-- Feature 20: Smart-Collection-Vorschläge — verworfene Vorschläge merken.
-- Prerequisite: Feature 17 (collections) applied.

CREATE TABLE IF NOT EXISTS collection_suggestion_dismissals (
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_key text        NOT NULL CHECK (char_length(category_key) BETWEEN 1 AND 50),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category_key)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE collection_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY collection_suggestion_dismissals_owner ON collection_suggestion_dismissals
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
