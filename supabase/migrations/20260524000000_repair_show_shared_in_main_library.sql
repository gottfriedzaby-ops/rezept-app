-- Repair: idempotent rename merge_shared_tags_into_global -> show_shared_in_main_library.
-- Migration 20260507000000 was not applied in production, so /api/settings PATCH
-- (and the per-row INSERT in GET) fail with "column show_shared_in_main_library
-- does not exist" for every user. The library page also can't read the toggle.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'merge_shared_tags_into_global'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_settings'
      AND column_name  = 'show_shared_in_main_library'
  ) THEN
    ALTER TABLE user_settings
      RENAME COLUMN merge_shared_tags_into_global TO show_shared_in_main_library;
  END IF;
END $$;
