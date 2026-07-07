-- Feature 20: user-interaction logging / analytics
--
-- Adds `interaction_events` — an append-only, service-role-only log of user
-- page views + behavioural events, used by admins to analyse and optimise the
-- UX. Also adds an `analytics_enabled` consent flag to `user_settings`.
--
-- Prerequisites: Feature 05 (auth) applied; Feature 09 (`user_settings`) applied.
-- Run manually in the Supabase SQL editor. Code degrades gracefully if this
-- migration has not yet been applied (42P01 -> soft no-op / 503, and the
-- consent flag falls back to its default).
--
-- RETENTION (the app has no cron): purge old rows via a documented manual job,
-- e.g. run periodically in the SQL editor:
--   DELETE FROM interaction_events WHERE created_at < now() - interval '90 days';
-- If the Supabase plan has pg_cron, schedule it instead:
--   SELECT cron.schedule('purge_interaction_events', '0 3 * * *',
--     $$DELETE FROM interaction_events WHERE created_at < now() - interval '90 days'$$);

CREATE TABLE IF NOT EXISTS interaction_events (
  -- Client-generated uuid. Makes flush retries idempotent (ON CONFLICT DO
  -- NOTHING); gen_random_uuid() is a fallback for any server-side insert.
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL: keep anonymised aggregates after account deletion.
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name     text        NOT NULL,
  event_category text,
  properties     jsonb,
  path           text,
  locale         text,
  session_id     text,
  client_ts      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interaction_events_created_idx
  ON interaction_events (created_at DESC);
CREATE INDEX IF NOT EXISTS interaction_events_name_created_idx
  ON interaction_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS interaction_events_category_created_idx
  ON interaction_events (event_category, created_at DESC);
CREATE INDEX IF NOT EXISTS interaction_events_user_created_idx
  ON interaction_events (user_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- No policies: the service-role client bypasses RLS by design. End users never
-- read or write this table directly — writes go through /api/events and reads
-- through the middleware-gated /api/admin/analytics route.
ALTER TABLE interaction_events ENABLE ROW LEVEL SECURITY;

-- ─── Aggregation RPCs ────────────────────────────────────────────────────────
-- Aggregate in Postgres (tiny result sets) rather than pulling raw rows into the
-- admin route — this table is high-volume, unlike claude_api_calls. Called via
-- supabaseAdmin.rpc(...) from lib/admin-metrics.ts.

CREATE OR REPLACE FUNCTION analytics_event_counts(p_start timestamptz)
RETURNS TABLE (name text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT event_name, count(*)
  FROM interaction_events
  WHERE created_at >= p_start
  GROUP BY event_name;
$$;

CREATE OR REPLACE FUNCTION analytics_daily_counts(p_start timestamptz)
RETURNS TABLE (day date, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)
  FROM interaction_events
  WHERE created_at >= p_start
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION analytics_top_pages(p_start timestamptz, p_limit int)
RETURNS TABLE (path text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT coalesce(path, '(unbekannt)') AS path, count(*)
  FROM interaction_events
  WHERE created_at >= p_start AND event_name = 'page_view'
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION analytics_active_users(p_start timestamptz)
RETURNS bigint
LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT user_id)
  FROM interaction_events
  WHERE created_at >= p_start AND user_id IS NOT NULL;
$$;

-- ─── user_settings: analytics consent flag ──────────────────────────────────
-- DEFAULT true = opt-out model (tracking on by default; users disable it in the
-- Datenschutz settings section). Must stay in sync with ANALYTICS_DEFAULT_ENABLED
-- in lib/analytics-events.ts. ADD COLUMN ... DEFAULT backfills existing rows.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS analytics_enabled boolean NOT NULL DEFAULT true;
