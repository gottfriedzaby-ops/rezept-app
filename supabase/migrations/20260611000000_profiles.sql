-- Profiles: queryable mirror of auth.users for batch lookups
-- Replaces per-row auth.admin.getUserById() calls (N+1) and the paginated
-- auth.admin.listUsers() email search (broke silently at 51+ users).
-- App reads go through lib/profiles.ts (service role); the RLS policy only
-- lets a logged-in user read their own row.

-- ─── Trigger function (re-create idempotently) ───────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text        NOT NULL UNIQUE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON profiles (lower(email));

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Sync from auth.users ────────────────────────────────────────────────────
-- SECURITY DEFINER: the trigger fires as supabase_auth_admin, which has no
-- direct grant on public.profiles.
CREATE OR REPLACE FUNCTION sync_profile_from_auth_user()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO profiles (id, email, display_name)
    VALUES (
      NEW.id,
      lower(NEW.email),
      NULLIF(NEW.raw_user_meta_data->>'full_name', '')
    )
    ON CONFLICT (id) DO UPDATE
      SET email        = EXCLUDED.email,
          display_name = COALESCE(EXCLUDED.display_name, profiles.display_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
CREATE TRIGGER on_auth_user_profile_sync
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_profile_from_auth_user();

-- ─── Backfill existing users ─────────────────────────────────────────────────
INSERT INTO profiles (id, email, display_name)
SELECT
  id,
  lower(email),
  NULLIF(raw_user_meta_data->>'full_name', '')
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (id) DO UPDATE
  SET email        = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, profiles.display_name);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY profiles_select_self ON profiles
    FOR SELECT USING (id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
