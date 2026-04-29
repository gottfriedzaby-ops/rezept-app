# Feature 05 — Multi-User Authentication and Read-Only Sharing

**Benutzerkonten + Rezeptsammlung mit Freunden teilen**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **L** (8+ days) |
| Priority | High (Phase 2) |
| Dependencies | Unblocks Features 07 (Shopping List server-side) |

---

## 1. Overview

The app currently has no authentication — all recipes are visible to anyone with the URL and there is no concept of ownership. This feature introduces:

1. **User accounts:** Users register and log in with email/password, Google OAuth, or Apple OAuth.
2. **Recipe ownership:** Every recipe is owned by the user who created/imported it. Recipes are private by default.
3. **Read-only sharing:** An owner can generate a share link and send it to friends. Friends can browse the owner's recipe collection and use cook mode, but cannot modify anything.
4. **Access revocation:** The owner can revoke any share link at any time.

**Goal:** Make the app suitable for personal use with privacy, while still enabling the social sharing use case ("share my recipe collection with my partner").

---

## 2. User Stories

### US-05-1 — Register with email and password
> Als neuer Nutzer möchte ich mich mit meiner E-Mail-Adresse und einem Passwort registrieren können, damit ich ein persönliches Konto erstelle und meine Rezepte sicher gespeichert werden.

**Acceptance criteria:**
- Registration form: email + password + password confirmation.
- Email verification sent after registration.
- After verification, user is logged in and redirected to the recipe list.

---

### US-05-2 — Login with Google
> Als Nutzer möchte ich mich mit meinem Google-Konto anmelden können, damit ich kein weiteres Passwort verwalten muss.

**Acceptance criteria:**
- "Mit Google anmelden" button on the login page.
- Google OAuth flow completes and logs the user in.
- On first Google login, a new account is created automatically.

---

### US-05-3 — Login with Apple
> Als Nutzer möchte ich mich mit meiner Apple-ID anmelden können, damit ich die datenschutzfreundliche Anmeldemethode nutzen kann, die ich von anderen Apps kenne.

**Acceptance criteria:**
- "Mit Apple anmelden" button on the login page.
- Apple OAuth flow completes and logs the user in.
- Supports Apple's "Hide My Email" relay addresses.

---

### US-05-4 — Invite a friend via share link
> Als Nutzer möchte ich einen Einladungslink generieren und an einen Freund schicken können, damit dieser meine Rezeptsammlung durchstöbern kann, ohne sich einen Account erstellen zu müssen.

**Acceptance criteria:**
- "Sammlung teilen" button in the user settings or recipe list header.
- Generates a unique share link (e.g. `app.example.com/shared/{token}`).
- Friend opens the link and sees the owner's recipe collection in read-only mode.
- No login required for the friend (public share link).

---

### US-05-5 — Friend cannot edit, delete, or import
> Als eingeladener Freund möchte ich die Rezepte des Nutzers ansehen und den Kochmodus nutzen können, aber keine Rezepte verändern oder importieren dürfen, damit die Sammlung des Nutzers geschützt bleibt.

**Acceptance criteria:**
- Edit, delete, and import buttons are hidden for shared-link visitors.
- Direct API calls to mutating endpoints return `403 Forbidden` for unauthenticated/shared-link requests.
- Cook mode (read-only) is available for shared-link visitors.

---

### US-05-6 — Owner can revoke a share link
> Als Nutzer möchte ich einen geteilten Link widerrufen können, damit ein Freund nach dem Widerruf keinen Zugriff mehr auf meine Sammlung hat.

**Acceptance criteria:**
- Share links list in user settings shows all active share links with creation date and optional label.
- "Widerrufen" button per link sets `revoked_at` in the database.
- Revoked links return `404` or a "Dieser Link ist nicht mehr gültig" page.

---

### US-05-7 — Unauthenticated users are redirected to login
> Als unangemeldeter Besucher möchte ich beim Aufruf der App zur Anmeldeseite weitergeleitet werden, damit ich weiß, dass ich mich zuerst anmelden muss.

**Acceptance criteria:**
- All routes except the login/register page and shared recipe links redirect to `/login` for unauthenticated users.
- After login, the user is redirected back to the originally requested URL.

---

## 3. Functional Requirements

### FR-05-1 — Auth providers
The app MUST support the following authentication methods:
- Email + password (with email verification)
- Google OAuth 2.0
- Apple OAuth / Sign in with Apple

### FR-05-2 — Row-Level Security (RLS)
Supabase RLS policies MUST be applied to the `recipes` table:
- `SELECT`: owner can read their own recipes; shared-link visitors can read the owner's recipes (via token validation); no cross-user reads.
- `INSERT`, `UPDATE`, `DELETE`: owner only.

### FR-05-3 — Recipe ownership
Every recipe MUST have a `user_id` column referencing `auth.users(id)`. On import and manual creation, `user_id` MUST be set to `auth.uid()`.

### FR-05-4 — Share link generation
The owner MUST be able to generate a share token:
- Token: cryptographically random, URL-safe, minimum 32 characters.
- Stored in a `shares` table (see Data Model Impact).
- Share URL format: `{APP_URL}/shared/{token}`.

### FR-05-5 — Shared collection view
A request to `/shared/{token}` MUST:
1. Validate the token exists and is not revoked.
2. Identify the owner from the token.
3. Render the owner's recipe list in read-only mode.
4. Allow navigation to individual recipe detail pages and cook mode.
5. NOT show edit, delete, import, or favorite-toggle controls.

### FR-05-6 — Share link revocation
The owner MUST be able to revoke any share link via the settings page. Revocation MUST set `revoked_at = now()` on the `shares` row. Subsequent requests with the revoked token MUST receive an appropriate "Link ungültig" response.

### FR-05-7 — Logout
A "Abmelden" button MUST be accessible from the user menu. Logout clears the session and redirects to `/login`.

### FR-05-8 — Password reset
The app MUST support the "Passwort vergessen" flow:
- User enters email on `/login/forgot-password`.
- Supabase sends a password reset email.
- User clicks the link and sets a new password.

### FR-05-9 — Open decision: public demo mode
It is undecided whether the app should have a public demo mode (unauthenticated visitors can see sample recipes without logging in). See OQ-05-1.

---

## 4. Non-Functional Requirements

### NFR-05-1 — Auth provider: Supabase Auth (preferred)
Supabase Auth is the strongly preferred implementation because:
- It is built into the existing Supabase infrastructure.
- RLS policies integrate natively with `auth.uid()`.
- No additional paid service required.
- Supports email, Google, and Apple out of the box.

### NFR-05-2 — GDPR compliance
- Users MUST be able to delete their account and all associated data (recipes, share links).
- A "Konto löschen" option MUST be available in settings.
- No personal data MUST be sent to third parties beyond what is necessary for the chosen OAuth providers.
- Privacy policy and terms of service links MUST be shown on the registration page (content out of scope for engineering).

### NFR-05-3 — Session management
Sessions MUST be managed via Supabase's JWT-based session system. The Next.js app MUST use `@supabase/ssr` (or `@supabase/auth-helpers-nextjs`) for server-side session handling in App Router.

### NFR-05-4 — Security
- Passwords are managed by Supabase Auth (bcrypt hashing, no plaintext storage).
- Share tokens MUST be generated with `crypto.randomBytes(32).toString('base64url')` (or equivalent).
- Share tokens MUST NOT be guessable; they MUST NOT be sequential integers or UUIDs.
- All mutating API routes MUST validate `auth.uid()` server-side (not just client-side).

### NFR-05-5 — Existing recipes migration
Existing recipes (created before auth is deployed) MUST be assigned to an admin/seed user or handled via a migration strategy. This is an open question — see OQ-05-2.

---

## 6. Data Model Impact

### `recipes` table — new column
```sql
ALTER TABLE recipes
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Index for user's recipe list
CREATE INDEX recipes_user_id_idx ON recipes (user_id);
```

### `shares` table — new table
```sql
CREATE TABLE shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz DEFAULT now(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  label       text,           -- optional user-defined label e.g. "Link für Familie"
  revoked_at  timestamptz     -- NULL = active, non-NULL = revoked
);

CREATE INDEX shares_token_idx ON shares (token);
CREATE INDEX shares_owner_id_idx ON shares (owner_id);
```

### RLS Policies

```sql
-- Enable RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Owner can do anything
CREATE POLICY "owner_all" ON recipes
  FOR ALL USING (auth.uid() = user_id);

-- Shared-link read (handled via server-side validation and service role, not direct RLS)
-- OR via a custom function that validates the token:
CREATE POLICY "shared_read" ON recipes
  FOR SELECT USING (
    user_id IN (
      SELECT owner_id FROM shares
      WHERE token = current_setting('app.share_token', true)
        AND revoked_at IS NULL
    )
  );
```

---

## 7. Technical Options for Auth Provider

| Option | Pros | Cons |
|---|---|---|
| **Supabase Auth** (recommended) | Native RLS integration, no extra cost, supports email + Google + Apple, built into existing stack | UI components are basic; customization requires own forms |
| **Clerk** | Polished UI components, advanced session management, good Next.js App Router support | Paid above 10k MAU; adds external dependency |
| **NextAuth.js (Auth.js v5)** | Highly flexible, open source, strong community | More configuration required; RLS integration requires custom JWT claims setup |

**Recommendation:** Supabase Auth. It integrates natively with the existing Supabase setup and eliminates the need for an additional service.

---

## 8. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-05-1 | Should there be a public "demo" mode where unauthenticated users can see sample/featured recipes? | Auth middleware, public routes | Product |
| OQ-05-2 | What happens to existing recipes created before auth is deployed? Assign to a default user? Require claiming? | Migration plan | Engineering + Product |
| OQ-05-3 | Should sharing be per-collection (whole recipe list) or per-recipe? Per-recipe is more granular but adds complexity | Data model for shares | Product |
| OQ-05-4 | Should friends be able to create their own account and "fork" a shared recipe into their collection? | Nice-to-have feature, out of scope v1 | Product |
| OQ-05-5 | Apple Sign In requires a paid Apple Developer account ($99/yr) — is this confirmed available? | Prerequisites | Product |
| OQ-05-6 | Auth provider choice: confirmed Supabase Auth, or evaluate Clerk? | Architecture | Engineering + Product |

---

## 9. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-05-1 | Public demo mode? | **No** | Personal app; no user acquisition need; adds routing complexity for zero benefit |
| OQ-05-2 | Existing recipes before auth | **One-time SQL UPDATE** assigning all rows to owner's UUID after first login | No complex claiming flow needed for a single-user app |
| OQ-05-3 | Sharing granularity | **Whole collection** via a single revocable token | Per-recipe sharing requires a separate `recipe_shares` table — significantly more complex |
| OQ-05-4 | Friends can fork recipes? | **Out of scope** | Requires a full second user account; v3 at earliest |
| OQ-05-5 | Apple Sign In? | **Skip** — email + Google only | Web app; no App Store requirement; saves $99/yr Apple Developer fee |
| OQ-05-6 | Auth provider | **Supabase Auth confirmed** | Already in stack; native RLS integration; free at this scale |

---

## 10. Effort Estimate

**L — 8+ days**

| Task | Estimate |
|---|---|
| Supabase Auth setup (email + Google + Apple) | 4h |
| Login / Register / Forgot password pages | 6h |
| Next.js middleware (route protection) | 2h |
| RLS policies + recipes.user_id migration | 3h |
| Shares table + share link generation | 3h |
| Shared collection view (`/shared/[token]`) | 5h |
| Read-only UI (hide edit/delete/import buttons) | 2h |
| Share link management in settings | 3h |
| Revocation logic + revoked link page | 2h |
| GDPR: account deletion flow | 3h |
| Password reset flow | 2h |
| Existing recipes migration strategy | 2h |
| Testing + QA (all auth flows) | 6h |
| **Total** | **~43h** |

---

*Feature 05 of 8 — see [README.md](./README.md) for full index*
