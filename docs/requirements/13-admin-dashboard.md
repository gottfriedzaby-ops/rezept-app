# Feature 13 — Admin Dashboard for User & API Metrics

**Read-only Admin-Tab in `/settings` mit Nutzer-Metriken, Claude-API-Verbrauch, geschätzten Kosten und User-Management (Invite/Disable/Delete/Reset)**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **L** (8+ days) |
| Priority | Medium (operational tooling) |
| Dependencies | Feature 05 (Auth) — required for `auth.users` and per-user scoping |

---

## 1. Overview

The Rezept-App has no operator-facing surface. There is no way to see how many users exist, which users are active, how many recipes have been imported, how much Claude API spend has accumulated per user, or to invite/disable/delete users without going into the Supabase dashboard directly.

This feature introduces an **Admin Dashboard** as a new tab inside the existing `/settings` page. The tab is only rendered for users whose email is on an env-var-driven allowlist (`ADMIN_EMAILS`). Admins see aggregated metrics with a global time-window selector (24h / 7d / 30d / all-time), a per-user breakdown table, and a per-user detail page with full Claude API usage and estimated cost.

The dashboard also serves as the **user management surface**: admins can invite new users (by adding emails to an allowlist), disable or delete users, and trigger password-reset emails. Until go-live the invite allowlist is the only way to register (controlled via env flag `INVITE_ONLY_REGISTRATION`).

A new persistence layer, `claude_api_calls`, captures one row per Claude API request. The existing in-memory `ClaudeCallMeta` object in `lib/claude.ts` is the data source — call sites currently discard it; this feature persists it via fire-and-forget insert.

**Goal:** Give the operator a single page that answers "Who is using the app? How much have they cost me? And what do I need to do for new users?" — without leaving the app.

---

## 2. Business Requirements

| ID | Requirement |
|----|-------------|
| BR-13-1 | The operator must be able to see total users, active users, and recipe-creation activity over the last 24h / 7d / 30d / all-time without querying the database directly. |
| BR-13-2 | The operator must be able to see Claude API call volume, token consumption, and estimated USD cost per user and globally, broken down by Claude function. |
| BR-13-3 | The operator must be able to invite new users by adding their email to an allowlist; non-allowlisted emails must be blocked from `/register`. |
| BR-13-4 | The operator must be able to disable, delete, or send a password-reset link for any user from the dashboard. |
| BR-13-5 | Non-admin users must never see the Admin tab and must never gain insight into other users' data via the admin surface. |
| BR-13-6 | Admin status must be configurable without a deploy (env var) and without a schema change. |

---

## 3. Functional Requirements

### Admin identity & access control

| ID | Requirement |
|----|-------------|
| FR-13-1 | An environment variable `ADMIN_EMAILS` contains a comma-separated list of email addresses with admin privileges (e.g. `ADMIN_EMAILS=a@example.com,b@example.com`). |
| FR-13-2 | A helper `isAdmin(user): boolean` compares the current user's email (case-insensitive, trimmed) against the parsed allowlist. |
| FR-13-3 | The Admin tab in `/settings` is rendered only when `isAdmin(currentUser)` returns `true`. Non-admins see the existing settings page unchanged. |
| FR-13-4 | All `/api/admin/*` routes call `isAdmin` server-side and return `403 Forbidden` for non-admins. |
| FR-13-5 | Non-admins who navigate to any admin sub-route or URL fragment (e.g. `/settings#admin`, `/settings/admin`) are silently redirected to `/settings` (no error message — no information disclosure). |
| FR-13-6 | `middleware.ts` enforces the admin check for any path matching `/api/admin/*`. |
| FR-13-7 | If `ADMIN_EMAILS` is empty or unset, the Admin tab is never rendered and all `/api/admin/*` routes return `403`. The app must not error in this state. |

### Dashboard layout

| ID | Requirement |
|----|-------------|
| FR-13-8 | The Admin tab is the last tab in `/settings`. Tab label: **"Admin"**. |
| FR-13-9 | A single global time-window selector at the top of the dashboard offers four options: **24h**, **7d**, **30d**, **All-Time**. Default: **7d**. |
| FR-13-10 | The selected window applies to ALL metrics on the page (user counts, recipe counts, API calls, cost). |
| FR-13-11 | The dashboard is laid out in four sections (top to bottom): (1) User Activity, (2) Recipe Usage Breakdown, (3) Claude API & Token Usage, (4) Estimated Cost. |
| FR-13-12 | Below the four sections is a per-user table. Each row represents one user. Clicking a row opens the per-user detail page (FR-13-26). |

### Section 1 — User Activity

| ID | Requirement |
|----|-------------|
| FR-13-13 | Display **total registered users** (count of `auth.users`). Always all-time — not affected by window selector. |
| FR-13-14 | Display **new users in window** (count of `auth.users` where `created_at` ≥ window start). |
| FR-13-15 | Display **active users in window** (distinct users with `last_sign_in_at` ≥ window start). |
| FR-13-16 | Display **recipes created in window** (count of `recipes` where `created_at` ≥ window start). |

### Section 2 — Recipe Usage Breakdown

| ID | Requirement |
|----|-------------|
| FR-13-17 | Display recipes created in window, grouped by `source_type` (url, photo, youtube, instagram, manual, pdf). Show count per source type and percentage of total. |
| FR-13-18 | Display the **top 10 tags** across recipes created in window, sorted by frequency descending. |
| FR-13-19 | Display **total active shares** (count of `shares` where `revoked_at IS NULL`). Always all-time — not affected by window selector. |

### Section 3 — Claude API & Token Usage

| ID | Requirement |
|----|-------------|
| FR-13-20 | Display Claude API calls in window, grouped by `function` (parseRecipeFromText, parseRecipeFromImage, parseRecipeFromImages, reviewAndImproveRecipe, estimateNutrition). Show count and percentage. |
| FR-13-21 | For each function, display total `input_tokens`, total `output_tokens`, total `cache_read_tokens`, and total `cache_creation_tokens` in the window. |
| FR-13-22 | Display the success / error breakdown (count of `status = 'success'` vs `status = 'error'` in window). |
| FR-13-23 | Display the count of unique users with at least one Claude API call in window. |

### Section 4 — Estimated Cost

| ID | Requirement |
|----|-------------|
| FR-13-24 | Display total estimated USD cost in window across all users, computed from `claude_api_calls` rows × pricing constants (see FR-13-37). |
| FR-13-25 | Cost is broken down per Claude function and per model. Cache-read and cache-creation tokens are priced separately (cache-read ~0.1× base, cache-creation 1.25× base for 5-min TTL). |

### Per-user table & detail page

| ID | Requirement |
|----|-------------|
| FR-13-26 | The per-user table lists every user with columns: **Email**, **Registered** (date of `created_at`), **Last sign-in** (`last_sign_in_at`), **Recipes** (lifetime count), **API calls in window**, **Est. cost in window (USD)**, **Status** (active / disabled). |
| FR-13-27 | The table is sortable by each column. Default sort: estimated cost in window descending. |
| FR-13-28 | Clicking a row navigates to `/settings/admin/users/[userId]` — a per-user detail page. |
| FR-13-29 | The per-user detail page shows: user metadata (email, created_at, last_sign_in_at, status), lifetime recipe count, recipe count in window, recipe breakdown by `source_type` in window, Claude API usage broken down by function and model in window, estimated cost broken down by function and model in window. |
| FR-13-30 | The per-user detail page does NOT show individual Claude prompt content or response bodies — only aggregated metadata. |

### User management actions

| ID | Requirement |
|----|-------------|
| FR-13-31 | The per-user detail page exposes three actions: **Disable user**, **Delete user**, **Send password-reset email**. |
| FR-13-32 | **Disable user** marks the user as disabled in Supabase Auth (sets `banned_until` to a far-future date or equivalent) via the Supabase admin API. Disabled users cannot sign in but their data is retained. |
| FR-13-33 | **Delete user** deletes the user from `auth.users` via the Supabase admin API. The existing `ON DELETE CASCADE` on `recipes.user_id` removes the user's recipes, shares, and library shares. A confirmation modal is required: "Diese Aktion kann nicht rückgängig gemacht werden. Alle Rezepte des Nutzers werden gelöscht." |
| FR-13-34 | **Send password-reset email** triggers a Supabase Auth password-reset email for the user. |
| FR-13-35 | None of these actions are available for the currently signed-in admin themselves (admins cannot disable/delete their own account from this UI). |
| FR-13-36 | All three actions are logged to server logs with admin email, target user id, action, and timestamp. (No new DB table required — server logs only.) |

### Pricing constants

| ID | Requirement |
|----|-------------|
| FR-13-37 | A versioned config file `lib/claude-pricing.ts` exports the per-model input/output/cache-read/cache-creation prices in USD per 1M tokens. The file is the single source of truth for cost computation. |
| FR-13-38 | The pricing file must cover every model used in `lib/claude.ts` at the time of writing (`claude-sonnet-4-6`, `claude-haiku-4-5`). If a Claude call uses a model not present in the pricing table, the cost for that call is computed as `null` and the UI shows "—" with a tooltip "Modell nicht in Preistabelle". |
| FR-13-39 | The pricing file is plain TypeScript (no env vars, no DB lookup). Updates require a code change and a deploy. |

### Invite allowlist & registration gate

| ID | Requirement |
|----|-------------|
| FR-13-40 | A new table `invited_emails` stores allowlisted emails. Schema in §5. |
| FR-13-41 | An environment variable `INVITE_ONLY_REGISTRATION` (values: `"true"` / `"false"`, default `"true"`) controls whether the invite gate is enforced. |
| FR-13-42 | When `INVITE_ONLY_REGISTRATION="true"`, the `/register` endpoint rejects any email not present in `invited_emails` with HTTP `403` and the German message: **"Diese E-Mail-Adresse ist nicht für die Registrierung freigeschaltet."** |
| FR-13-43 | When a user successfully registers, the corresponding `invited_emails` row's `registered_at` is set to `now()`. |
| FR-13-44 | When `INVITE_ONLY_REGISTRATION="false"`, the gate is disabled and `/register` accepts any email (existing behavior). |
| FR-13-45 | The Admin tab exposes a section **"Eingeladene E-Mail-Adressen"** with: a list of allowlisted emails (showing email, invited_at, registered_at), a form to add an email, and a delete button per row. |
| FR-13-46 | Adding an email that already exists in `invited_emails` is a no-op (idempotent); the UI shows "Diese E-Mail ist bereits freigeschaltet". |
| FR-13-47 | Deleting an email from `invited_emails` does NOT delete the user account if the user has already registered — only removes the allowlist entry. The UI must communicate this in the delete confirmation. |
| FR-13-48 | Email comparison is case-insensitive and trims whitespace. Storage normalizes to lowercase. |

### Claude API call tracking

| ID | Requirement |
|----|-------------|
| FR-13-49 | Every Claude API call made via `lib/claude.ts` (i.e. every existing call site CS-1..CS-5 from Feature 12) inserts one row into `claude_api_calls` after the API call completes (success or error). |
| FR-13-50 | The insert is **fire-and-forget**: a `void promise` that does not block the calling code and whose failure is caught and logged but never thrown. A failed insert MUST NOT cause an import to fail. |
| FR-13-51 | The row includes: `user_id` (from the calling route's auth context, passed into the `lib/claude.ts` function as a new optional parameter), `function`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens` (nullable), `cache_creation_tokens` (nullable), `duration_ms`, `status` (`success` or `error`), `error_message` (nullable), `created_at`. |
| FR-13-52 | If `user_id` is unknown at the call site (e.g. a future internal/background job without user context), it is stored as `NULL`. |
| FR-13-53 | The `lib/claude.ts` function signatures gain an optional trailing parameter `userId?: string` to thread the auth context through. No call site is required to pass it for compilation, but every existing call site SHOULD be updated to pass it. |
| FR-13-54 | The existing `ClaudeCallMeta` interface remains unchanged in shape; the persistence layer reads from it directly and adds `user_id` from the new parameter. |

### Read-only behavior

| ID | Requirement |
|----|-------------|
| FR-13-55 | The dashboard's metric and aggregation sections are read-only. Only the user management section (FR-13-31..FR-13-36, FR-13-45..FR-13-48) writes data. |

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-13-1 | Dashboard initial load (window = 7d) MUST render under 2 seconds on a database with up to 10,000 `claude_api_calls` rows and 100 users. |
| NFR-13-2 | All aggregation queries MUST be index-backed; full table scans on `claude_api_calls` are not acceptable. |
| NFR-13-3 | The tracking insert in `lib/claude.ts` MUST add no more than 5ms p99 to the Claude API call latency. (The insert is async; this measures only the synchronous overhead of scheduling it.) |
| NFR-13-4 | TypeScript strict mode preserved — no `any` types in new code. |
| NFR-13-5 | All admin API responses follow the existing `{ data, error }` convention. |
| NFR-13-6 | The pricing constants file MUST be versioned in git; changes are reviewable. |
| NFR-13-7 | The admin check (`isAdmin`) MUST be evaluated server-side for every admin API request; client-side check is presentation-only and never authoritative. |
| NFR-13-8 | RLS policies on `claude_api_calls`: only the service role (used by admin API routes) can SELECT. End users cannot read this table directly. |
| NFR-13-9 | RLS policies on `invited_emails`: only the service role can SELECT/INSERT/UPDATE/DELETE. The `/register` route uses the service role for its allowlist check. |
| NFR-13-10 | Privacy: the admin surface exposes user emails and aggregate usage data only. No raw Claude prompt content, no response bodies, no recipe titles in the admin surface. |
| NFR-13-11 | The dashboard MUST gracefully handle users who have zero Claude API calls (display "0" / "—", never crash). |
| NFR-13-12 | The dashboard MUST gracefully handle users who have been deleted (orphaned `claude_api_calls` rows with a `user_id` no longer in `auth.users` are shown under a synthetic "Gelöschter Nutzer" group). |

---

## 5. Data Model Impact

### New table — `claude_api_calls`

```sql
CREATE TABLE IF NOT EXISTS claude_api_calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  function              text NOT NULL,
  model                 text NOT NULL,
  input_tokens          integer NOT NULL DEFAULT 0,
  output_tokens         integer NOT NULL DEFAULT 0,
  cache_read_tokens     integer,
  cache_creation_tokens integer,
  duration_ms           integer NOT NULL DEFAULT 0,
  status                text NOT NULL CHECK (status IN ('success', 'error')),
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX claude_api_calls_user_created_idx
  ON claude_api_calls (user_id, created_at DESC);

CREATE INDEX claude_api_calls_created_idx
  ON claude_api_calls (created_at DESC);

CREATE INDEX claude_api_calls_function_created_idx
  ON claude_api_calls (function, created_at DESC);

ALTER TABLE claude_api_calls ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for authenticated users — only service-role access.
-- Service-role bypasses RLS by design.
```

### New table — `invited_emails`

```sql
CREATE TABLE IF NOT EXISTS invited_emails (
  email         text PRIMARY KEY,
  invited_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at    timestamptz NOT NULL DEFAULT now(),
  registered_at timestamptz
);

ALTER TABLE invited_emails ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT policies for authenticated users — only service-role access.
```

`email` is stored lowercased; the application layer normalizes on insert and on lookup.

### No changes to existing tables

`recipes`, `shares`, `library_shares`, `user_settings`, and `import_jobs` are unaffected.

---

## 6. Implementation Hints

### File layout (suggested, non-binding)

```
/app
  /(admin)                            ← optional route group, or fold into /settings
  /api/admin/
    /metrics/route.ts                 ← GET aggregated metrics, window-scoped
    /users/route.ts                   ← GET user table
    /users/[id]/route.ts              ← GET per-user detail
    /users/[id]/disable/route.ts      ← POST
    /users/[id]/delete/route.ts       ← DELETE
    /users/[id]/reset-password/route.ts ← POST
    /invited-emails/route.ts          ← GET list, POST add
    /invited-emails/[email]/route.ts  ← DELETE
  /settings/page.tsx                  ← add Admin tab (conditional)
/components/admin/
  AdminDashboard.tsx
  TimeWindowSelector.tsx
  UserActivitySection.tsx
  RecipeUsageSection.tsx
  ApiUsageSection.tsx
  CostSection.tsx
  UserTable.tsx
  UserDetailPage.tsx
  InvitedEmailsManager.tsx
/lib/
  admin.ts                            ← isAdmin(), parseAdminEmails()
  claude-pricing.ts                   ← per-model pricing constants
  claude-api-tracking.ts              ← logClaudeCall() — fire-and-forget insert
/middleware.ts                         ← extend matcher to gate /api/admin/*
/supabase/migrations/
  YYYYMMDDHHMMSS_feature13_admin.sql  ← both new tables + indexes + RLS
```

### `isAdmin()` parsing

```ts
function parseAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdmin(user: { email?: string | null } | null): boolean {
  if (!user?.email) return false;
  return parseAdminEmails().has(user.email.trim().toLowerCase());
}
```

### Tracking insert pattern

Inside each Claude call in `lib/claude.ts`, after the API response and `meta` construction:

```ts
void logClaudeCall({
  user_id: userId ?? null,
  function: meta.function,
  model: meta.model,
  input_tokens: meta.inputTokens,
  output_tokens: meta.outputTokens,
  cache_read_tokens: meta.cacheReadInputTokens ?? null,
  cache_creation_tokens: meta.cacheCreationInputTokens ?? null,
  duration_ms: meta.durationMs,
  status: 'success',
  error_message: null,
}).catch(err => console.error('claude_api_calls insert failed', err));
```

On the error path, the same insert runs with `status: 'error'` and `error_message: <truncated err.message>`. `console.error` is the only side effect of a logging failure.

### Pricing computation

The cost for a single call is:

```
cost_usd =
    (input_tokens         * model.input_price_per_1m         / 1_000_000)
  + (output_tokens        * model.output_price_per_1m        / 1_000_000)
  + (cache_read_tokens    * model.cache_read_price_per_1m    / 1_000_000)
  + (cache_creation_tokens * model.cache_creation_price_per_1m / 1_000_000)
```

Pricing values for the two models in use at the time of writing should be confirmed against the current Anthropic pricing page before merging the implementation.

### Disable/Delete via Supabase admin API

The Supabase JS client supports `supabase.auth.admin.updateUserById(id, { ban_duration })`, `supabase.auth.admin.deleteUser(id)`, and `supabase.auth.admin.generateLink({ type: 'recovery', email })`. These require the service-role key (`SUPABASE_SERVICE_ROLE_KEY`, already in `.env.local`).

### Time window calculation

```ts
const WINDOWS = {
  '24h': () => new Date(Date.now() - 24 * 60 * 60 * 1000),
  '7d':  () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  '30d': () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  'all': () => new Date(0),
} as const;
```

All-time uses the Unix epoch as the lower bound.

---

## 7. User Stories

### US-13-1 — Admin opens the dashboard
> Als Administrator möchte ich im Einstellungsbereich einen Admin-Tab sehen, sobald meine E-Mail-Adresse in `ADMIN_EMAILS` hinterlegt ist, damit ich Nutzeraktivität und Kosten überprüfen kann.

**Acceptance criteria:**
- [ ] My email is in `ADMIN_EMAILS` → I see the "Admin" tab in `/settings`.
- [ ] My email is not in `ADMIN_EMAILS` → I do not see the "Admin" tab; trying `/settings/admin` redirects me to `/settings` silently.
- [ ] The Admin tab loads in under 2 seconds with the default 7d window.

### US-13-2 — Switch time window
> Als Administrator möchte ich zwischen 24 Stunden, 7 Tagen, 30 Tagen und Gesamt umschalten können, damit ich Trends einordnen kann.

**Acceptance criteria:**
- [ ] The window selector at the top of the dashboard updates all four sections.
- [ ] The selected window is persisted across page reloads (via URL query param `?window=7d`).
- [ ] Section 1's "total registered users" and Section 2's "total active shares" do NOT change when the window changes (they are explicitly all-time per FR-13-13 / FR-13-19).

### US-13-3 — Inspect a single user's usage
> Als Administrator möchte ich auf eine Zeile in der Nutzertabelle klicken können, um eine Detailansicht mit Claude-Verbrauch und Kostenschätzung dieses Nutzers zu sehen.

**Acceptance criteria:**
- [ ] Clicking a user row navigates to `/settings/admin/users/[userId]`.
- [ ] The detail page shows the user's lifetime recipe count, recipes in window broken down by `source_type`, Claude API calls broken down by function and model, and estimated USD cost per function/model.
- [ ] The detail page does not show any Claude prompt content or response bodies.

### US-13-4 — Invite a new user
> Als Administrator möchte ich eine E-Mail-Adresse auf eine Allowlist setzen, damit nur diese Person sich registrieren kann.

**Acceptance criteria:**
- [ ] Adding `alice@example.com` to the allowlist allows Alice to register at `/register`.
- [ ] An email not on the allowlist sees: "Diese E-Mail-Adresse ist nicht für die Registrierung freigeschaltet."
- [ ] After Alice registers, her row in `invited_emails` shows a non-null `registered_at`.

### US-13-5 — Disable a user
> Als Administrator möchte ich einen Nutzer deaktivieren können, damit er sich nicht mehr anmelden kann, ohne seine Daten zu löschen.

**Acceptance criteria:**
- [ ] Disabling sets the user's auth ban so login fails.
- [ ] The user's recipes remain in the database (not deleted).
- [ ] The user's status in the per-user table shows "Deaktiviert".

### US-13-6 — Delete a user
> Als Administrator möchte ich einen Nutzer und alle seine Daten löschen können, damit ich auf Lösch-Anfragen reagieren kann.

**Acceptance criteria:**
- [ ] A confirmation modal warns the action is irreversible and deletes all recipes.
- [ ] After confirmation, `auth.users` row is removed; `recipes` rows owned by the user are removed via `ON DELETE CASCADE`; `claude_api_calls` rows have their `user_id` set to `NULL` (per the `ON DELETE SET NULL` constraint, preserving cost history).
- [ ] The user disappears from the per-user table.

### US-13-7 — Send a password-reset link
> Als Administrator möchte ich für einen Nutzer einen Passwort-Reset-Link auslösen können, damit ich bei Login-Problemen helfen kann.

**Acceptance criteria:**
- [ ] Triggering the action sends an email via Supabase Auth to the user.
- [ ] The action is logged with admin email, target user id, and timestamp.

### US-13-8 — Non-admin probes the URL
> Als nicht-administrativer Nutzer möchte ich beim Aufruf einer Admin-URL keinen Hinweis darauf bekommen, dass diese URL existiert, damit kein Information Disclosure stattfindet.

**Acceptance criteria:**
- [ ] `GET /settings/admin/users/<any-id>` → 302 redirect to `/settings`. No flash, no error message, no console warning.
- [ ] `GET /api/admin/metrics` → 403 with `{ data: null, error: 'forbidden' }`. No information about why.

### US-13-9 — Cache hit tokens included in cost
> Als Administrator möchte ich, dass auch Cache-Lese- und Cache-Schreib-Tokens in die Kostenschätzung einfließen, damit die Schätzung später (wenn Caching aktiv wird) weiterhin stimmt.

**Acceptance criteria:**
- [ ] Cost per call applies the model-specific rates for input, output, cache-read, and cache-creation tokens.
- [ ] If a call has no cache tokens (current state), the cost is computed correctly from input+output only.

---

## 8. Out of Scope

The following are explicitly NOT part of this feature:

- **Import-limit override.** Admins cannot raise an individual user's 20/day import cap from the dashboard.
- **Per-prompt inspection.** No view of Claude prompt content, no recipe-level cost drilldown beyond the per-user aggregate.
- **Bulk actions.** No multi-select on the user table; no bulk-disable or bulk-delete.
- **Email composition.** Admins cannot send custom emails to users from the dashboard. Password-reset is the only outbound email.
- **Self-service signup with admin approval workflow.** The allowlist is the only gate; there is no "request access" queue.
- **CSV / JSON export of metrics.** The dashboard is screen-only.
- **Charts / time-series visualisation.** Only point-in-time aggregates per the selected window. No line charts.
- **Real-time updates.** The dashboard fetches on load; refreshing requires a manual page reload.
- **Multi-admin audit log table.** Admin actions are logged to server logs only; no in-DB audit trail.
- **Persisting raw Claude prompts or responses.** Only metadata (tokens, model, function, duration, status).
- **Retention policy / automatic deletion of old `claude_api_calls` rows.** v1 retains rows indefinitely. See OQ-13-1.
- **Caching of admin metric queries.** Each load runs fresh aggregates.
- **Internationalisation of admin UI text.** German UI text only, matching the rest of the app.
- **Mobile-optimised admin UI.** Desktop-first; reasonable but not polished on small screens.

---

## 9. Open Questions & Decisions Needed

| # | Question | Options | Owner |
|---|---|---|---|
| OQ-13-1 | What retention policy should apply to `claude_api_calls`? Rows accumulate over time and the table could grow large. | **(a)** Retain indefinitely (v1 default). **(b)** Automatic delete after 90 days via a scheduled job. **(c)** Aggregate-and-roll-up: keep raw rows for 30 days, then collapse into daily-per-user-per-function summary rows. | Engineering + Product |
| OQ-13-2 | Should the dashboard include a "self" row for the admin's own usage? | **(a)** Yes — admins see themselves in the per-user table like anyone else. **(b)** No — filter out the current admin's row to reduce noise. | Product |
| OQ-13-3 | When `INVITE_ONLY_REGISTRATION` flips from `"true"` to `"false"` after go-live, should existing `invited_emails` rows be deleted or retained as a historical record? | **(a)** Retain. **(b)** Drop the table in a follow-up migration. | Product |
| OQ-13-4 | Should the "Send password-reset" action have a rate limit per admin (to prevent accidental spam)? | **(a)** No rate limit (admins are trusted). **(b)** Soft limit of 5 resets per minute per admin. | Engineering |
| OQ-13-5 | What is the exact set of pricing values for `claude-sonnet-4-6` and `claude-haiku-4-5` to seed `lib/claude-pricing.ts`? | Numeric values from the current Anthropic pricing page at implementation time. | Engineering |
| OQ-13-6 | Should the admin be able to see `error_message` text in the per-user detail page, or only error counts? | **(a)** Counts only. **(b)** Counts + most recent N error messages (with truncation). | Engineering + Product |
| OQ-13-7 | Should deleted users' rows in `claude_api_calls` retain the email or only the (now-null) `user_id`? Without the email, historical cost reports for that user become "Gelöschter Nutzer (id snippet)". | **(a)** Current schema (NULL user_id, no email). **(b)** Add `user_email_snapshot text` column populated at insert time for historical lookup. | Product |

---

## 10. Effort Estimate

**Overall: L** (8+ days, single full-stack developer familiar with the codebase).

Breakdown:

| Sub-task | Estimate |
|---|---|
| `claude_api_calls` table + tracking insert in `lib/claude.ts` + thread `userId` through 5 call sites + 4 import routes + confirm + nutrition | 2 days |
| `lib/claude-pricing.ts` + cost computation library | 0.5 day |
| `isAdmin()` + middleware gate + `/api/admin/*` route scaffolding | 0.5 day |
| Dashboard UI: time-window selector, four sections, user table | 2 days |
| Per-user detail page | 1 day |
| User management actions (disable, delete, reset password) + confirmation modals | 1 day |
| Invite allowlist: table + `/register` gate + admin UI | 1 day |
| Migration + RLS policies + service-role wiring | 0.5 day |
| Tests (Jest) for `isAdmin`, pricing math, tracking insert resilience, allowlist gate | 1 day |
| Manual QA + polish | 0.5 day |

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Admin** | A user whose email is present in the `ADMIN_EMAILS` env var. No DB column. |
| **Allowlist** | The set of emails permitted to register, stored in `invited_emails`. Distinct from admin status. |
| **Window** | The time range (24h / 7d / 30d / all-time) selected at the top of the dashboard. Applies to metrics that are flow rates (calls in window, recipes in window) but not to all-time totals (registered users, active shares). |
| **Fire-and-forget insert** | A `void`-returning promise call into Supabase whose failure is logged but never propagates. Used for `claude_api_calls` tracking to guarantee Claude API behavior is unaffected by tracking errors. |
| **CS-N** | Call site N in `lib/claude.ts`, as defined in Feature 12. CS-1 = parseRecipeFromText, CS-2 = parseRecipeFromImage, CS-3 = parseRecipeFromImages, CS-4 = reviewAndImproveRecipe, CS-5 = estimateNutrition. |
| **Pricing constants** | The per-1M-token USD prices for input, output, cache-read, and cache-creation, per model, defined in `lib/claude-pricing.ts`. |
| **Disabled user** | A user whose `banned_until` is set far in the future via the Supabase admin API. Cannot sign in. Data retained. |

---

*Feature 13 of N — see [README.md](./README.md) for full index.*
