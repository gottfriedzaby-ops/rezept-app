-- Feature 13 (foundation): admin dashboard + invite-only registration
--
-- Adds two tables — `claude_api_calls` for per-call API usage tracking
-- (populated by lib/claude.ts in a follow-up PR) and `invited_emails`
-- for the registration allowlist used by /register when
-- INVITE_ONLY_REGISTRATION="true". Both tables are service-role-only
-- via RLS; end users never read or write them directly.

create table if not exists claude_api_calls (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete set null,
  function              text not null,
  model                 text not null,
  input_tokens          integer not null default 0,
  output_tokens         integer not null default 0,
  cache_read_tokens     integer,
  cache_creation_tokens integer,
  duration_ms           integer not null default 0,
  status                text not null check (status in ('success', 'error')),
  error_message         text,
  created_at            timestamptz not null default now()
);

create index if not exists claude_api_calls_user_created_idx
  on claude_api_calls (user_id, created_at desc);

create index if not exists claude_api_calls_created_idx
  on claude_api_calls (created_at desc);

create index if not exists claude_api_calls_function_created_idx
  on claude_api_calls (function, created_at desc);

alter table claude_api_calls enable row level security;
-- No policies for authenticated/anon users — service-role bypasses RLS by design.

create table if not exists invited_emails (
  email         text primary key,
  invited_by    uuid references auth.users(id) on delete set null,
  invited_at    timestamptz not null default now(),
  registered_at timestamptz
);

alter table invited_emails enable row level security;
-- No policies for authenticated/anon users — only the service-role-backed
-- /api/auth/preflight-register and /api/admin/invited-emails routes touch it.
