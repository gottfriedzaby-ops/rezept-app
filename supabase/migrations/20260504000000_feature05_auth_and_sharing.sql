-- Feature 05: Multi-User Authentication and Read-Only Sharing
-- Run in Supabase SQL Editor after enabling Supabase Auth

-- 1. Add user_id to recipes
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes (user_id);

-- 2. Shares table
CREATE TABLE IF NOT EXISTS shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  label       text,
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS shares_token_idx ON shares (token);
CREATE INDEX IF NOT EXISTS shares_owner_id_idx ON shares (owner_id);

-- 3. Enable RLS on recipes
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their own recipes
CREATE POLICY IF NOT EXISTS "owner_all" ON recipes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Shared-link visitors can read the owner's recipes (token validated server-side via service role)
-- The service role used in /shared/[token] bypasses RLS, token validity is checked in application code.

-- 4. Enable RLS on shares
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "owner_all_shares" ON shares
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 5. Existing recipes migration:
--    After first owner login, run this once to assign all unowned recipes to the owner:
--    UPDATE recipes SET user_id = '<owner-uuid>' WHERE user_id IS NULL;
