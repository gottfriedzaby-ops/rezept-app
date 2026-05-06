-- Feature 09: Library Sharing
-- Prerequisite: Feature 05 (auth + shares tables already applied)

-- ─── Trigger function (re-create idempotently) ───────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── recipes: add is_private ─────────────────────────────────────────────────
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS recipes_is_private_idx ON recipes (is_private);

-- ─── library_shares ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_shares (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  owner_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_email  text        NOT NULL,
  status           text        NOT NULL CHECK (status IN (
                     'pending', 'accepted', 'declined', 'left', 'revoked'
                   )),
  invitation_token text        UNIQUE,
  invited_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz,
  declined_at      timestamptz,
  revoked_at       timestamptz,
  UNIQUE (owner_id, recipient_email)
);

CREATE INDEX IF NOT EXISTS library_shares_owner_idx     ON library_shares (owner_id);
CREATE INDEX IF NOT EXISTS library_shares_recipient_idx ON library_shares (recipient_id);
CREATE INDEX IF NOT EXISTS library_shares_status_idx    ON library_shares (status);
CREATE INDEX IF NOT EXISTS library_shares_token_idx     ON library_shares (invitation_token);

DROP TRIGGER IF EXISTS library_shares_updated_at ON library_shares;
CREATE TRIGGER library_shares_updated_at
  BEFORE UPDATE ON library_shares
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── library_share_reshare_requests ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_share_reshare_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  parent_share_id    uuid        NOT NULL REFERENCES library_shares(id) ON DELETE CASCADE,
  requested_by_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email       text        NOT NULL,
  status             text        NOT NULL CHECK (status IN (
                       'pending_owner_consent', 'approved', 'rejected', 'cancelled'
                     )),
  resolved_at        timestamptz,
  resulting_share_id uuid        REFERENCES library_shares(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS lsrr_parent_idx ON library_share_reshare_requests (parent_share_id);
CREATE INDEX IF NOT EXISTS lsrr_status_idx ON library_share_reshare_requests (status);
CREATE INDEX IF NOT EXISTS lsrr_req_idx    ON library_share_reshare_requests (requested_by_id);

-- ─── user_settings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id                       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  merge_shared_tags_into_global boolean     NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS user_settings_updated_at ON user_settings;
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS: recipes ────────────────────────────────────────────────────────────
-- Drop old catch-all owner policy and replace with split SELECT / write policies
-- so accepted library-share recipients can read non-private recipes.
DROP POLICY IF EXISTS "owner_all" ON recipes;

DO $$ BEGIN
  CREATE POLICY recipes_select_owner_or_shared ON recipes
    FOR SELECT USING (
      user_id = auth.uid()
      OR (
        is_private = false
        AND EXISTS (
          SELECT 1 FROM library_shares ls
          WHERE ls.owner_id     = recipes.user_id
            AND ls.recipient_id = auth.uid()
            AND ls.status       = 'accepted'
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY recipes_modify_owner_only ON recipes
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS: library_shares ─────────────────────────────────────────────────────
ALTER TABLE library_shares ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY library_shares_select_party ON library_shares
    FOR SELECT USING (owner_id = auth.uid() OR recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_shares_insert_owner ON library_shares
    FOR INSERT WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_shares_update_owner ON library_shares
    FOR UPDATE
    USING    (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY library_shares_delete_owner ON library_shares
    FOR DELETE USING (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS: library_share_reshare_requests ─────────────────────────────────────
ALTER TABLE library_share_reshare_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY lsrr_select ON library_share_reshare_requests
    FOR SELECT USING (
      requested_by_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM library_shares ls
        WHERE ls.id = parent_share_id AND ls.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lsrr_insert_requester ON library_share_reshare_requests
    FOR INSERT WITH CHECK (requested_by_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lsrr_update ON library_share_reshare_requests
    FOR UPDATE USING (
      requested_by_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM library_shares ls
        WHERE ls.id = parent_share_id AND ls.owner_id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── RLS: user_settings ──────────────────────────────────────────────────────
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY user_settings_owner ON user_settings
    FOR ALL
    USING    (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
