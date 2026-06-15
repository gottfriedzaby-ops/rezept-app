-- Feature 19 Phase 3: Intermittent fasting tracker
-- Prerequisite: Feature 05 (auth) applied; set_updated_at() exists (profiles migration).
-- Run manually in the Supabase SQL editor — code degrades gracefully (42P01)
-- until then.

-- ─── fasting_sessions ────────────────────────────────────────────────────────
-- One row per fast. An open fast has ended_at IS NULL; the partial unique index
-- below allows at most one open fast per user at a time.
CREATE TABLE IF NOT EXISTS fasting_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  target_hours  numeric     NOT NULL CHECK (target_hours BETWEEN 1 AND 48),
  preset        text        NOT NULL CHECK (preset IN ('16:8', '18:6', '20:4', 'omad', 'custom')),
  CONSTRAINT fasting_sessions_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- At most one open fast per user.
CREATE UNIQUE INDEX IF NOT EXISTS fasting_sessions_one_open_idx
  ON fasting_sessions (user_id) WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS fasting_sessions_user_started_idx
  ON fasting_sessions (user_id, started_at DESC);

DROP TRIGGER IF EXISTS fasting_sessions_updated_at ON fasting_sessions;
CREATE TRIGGER fasting_sessions_updated_at
  BEFORE UPDATE ON fasting_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE fasting_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY fasting_sessions_owner ON fasting_sessions
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
