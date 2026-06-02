-- Feature 10 (PDF import): private temp Storage bucket + multi-recipe picker sessions
--
-- Companion to 20260512000000_feature10_pdf_source_type.sql. Adds:
--   1. A PRIVATE Storage bucket `recipe-pdfs-temp` the client uploads PDFs to
--      directly (storage relay, FR-10-10/D3b), with per-user RLS on the
--      `{user_id}/…` prefix (NFR-10-3).
--   2. `pdf_import_sessions` — short-lived handles for the multi-recipe picker
--      follow-up (/api/import-pdf/pick, §7.2). Service-role only.
--   3. An orphan-cleanup function for abandoned sessions / temp objects
--      (NFR-10-2), scheduled via pg_cron when available.

-- 1. Private temp bucket -----------------------------------------------------
insert into storage.buckets (id, name, public)
values ('recipe-pdfs-temp', 'recipe-pdfs-temp', false)
on conflict (id) do nothing;

-- Per-user access scoped to the first path segment ({user_id}/…). The service
-- role (used by the API routes) bypasses these; they gate the client's direct
-- upload/preview/cleanup.
drop policy if exists "pdf-temp owner insert" on storage.objects;
create policy "pdf-temp owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-pdfs-temp'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pdf-temp owner select" on storage.objects;
create policy "pdf-temp owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recipe-pdfs-temp'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pdf-temp owner delete" on storage.objects;
create policy "pdf-temp owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-pdfs-temp'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. Multi-recipe picker sessions -------------------------------------------
create table if not exists pdf_import_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  storage_key text not null,
  filename    text not null,
  page_order  int[] not null,
  candidates  jsonb not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists pdf_import_sessions_expires_idx
  on pdf_import_sessions (expires_at);

alter table pdf_import_sessions enable row level security;
-- No policies for authenticated/anon users — only the service-role-backed
-- /api/import-pdf and /api/import-pdf/pick routes touch this table.

-- 3. Orphan cleanup ----------------------------------------------------------
create or replace function cleanup_pdf_import_orphans()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  -- Expired picker sessions (abandoned multi-recipe imports).
  delete from pdf_import_sessions where expires_at < now();
  -- Temp PDF objects older than 1 hour (happy-path imports delete eagerly via
  -- the Storage API; this sweeps anything left behind by failed/abandoned runs).
  delete from storage.objects
  where bucket_id = 'recipe-pdfs-temp'
    and created_at < now() - interval '1 hour';
end;
$$;

-- Schedule every 15 minutes when pg_cron is installed; otherwise schedule
-- `select cleanup_pdf_import_orphans();` via an external scheduler (NFR-10-2).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-pdf-import-orphans',
      '*/15 * * * *',
      'select cleanup_pdf_import_orphans();'
    );
  end if;
end;
$$;
