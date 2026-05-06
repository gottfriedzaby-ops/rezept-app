# Requirements: Library Sharing (Bibliothek teilen)

**Status:** Approved
**Author:** Requirements Engineer
**Date:** 2026-05-06
**Version:** 1.0
**Feature ID:** 09

---

## 1. Overview & Goals

### 1.1 Overview
Library Sharing enables a user (User A, the *owner/sharer*) to grant another user (User B, the *recipient*) read-only access to their entire recipe library. Unlike the existing token-based single-recipe sharing (Feature 05), this feature establishes a persistent, account-to-account relationship between two registered users so that User B can browse, search, view, and copy recipes from User A's library directly within their own authenticated app session.

The recipient sees the shared library as a separate, clearly-labelled "Geteilte Sammlung" alongside their own library. Recipes remain owned and managed exclusively by User A; User B can only read them or duplicate them into their own library.

### 1.2 Business Goals
- **Family / household use case:** Couples or families with separate accounts can share one combined recipe collection.
- **Trust-based collaboration:** Long-term sharing relationships between known users (e.g. friends, partners) without exposing public links.
- **Discovery:** Encourage recipe reuse through the "copy to my library" mechanism.
- **Account stickiness:** Drive registration of invited users via email invitation flow.

### 1.3 Success Metrics
- Number of active sharing relationships per user.
- Conversion rate of email invitations to registrations.
- Number of recipes copied/duplicated from shared collections per month.

---

## 2. User Stories

### 2.1 User A — The Sharer (Owner)
- **US-A1:** As User A, I want to invite another person by email address to share my recipe library, so that they can see my recipes within their own account.
- **US-A2:** As User A, I want my invitation to be sent as an email containing a registration link, so that the invitee can sign up and automatically receive access.
- **US-A3:** As User A, I want to see a list of all people I have shared my library with, including the invitation status (pending, accepted, declined), so that I can manage my sharing relationships.
- **US-A4:** As User A, I want to revoke access at any time, so that I retain control over who can see my recipes.
- **US-A5:** As User A, I want to mark individual recipes as private (excluded from sharing), so that I can keep some recipes for myself even while sharing the rest of my library.
- **US-A6:** As User A, I want to be notified by email when an invited user accepts my invitation, so that I know access has been established.
- **US-A7:** As User A, I want my decision required before User B can re-share my library with a third user (User C), so that I retain control over the chain of trust.

### 2.2 User B — The Recipient
- **US-B1:** As User B, I want to receive an email invitation with a registration link, so that I can join the app and gain access to the shared library.
- **US-B2:** As User B, after registration (or while logged in if I already have an account), I want to explicitly accept or decline an incoming sharing invitation, so that I am in control of which libraries appear in my account.
- **US-B3:** As User B, I want to see shared libraries in a dedicated top-level navigation entry "Geteilte Sammlungen", so that I can browse them separately from my own recipes.
- **US-B4:** As User B, I want to optionally view shared recipes mixed into my own recipe list (via filter/section), so that I can search across everything at once.
- **US-B5:** As User B, I want to see each shared recipe exactly as the owner sees it — including images, source link, tags, nutrition, and favorite flag — so that I have the full information.
- **US-B6:** As User B, I want full search, filter, and tag functionality on shared recipes, identical to my own library.
- **US-B7:** As User B, I want to copy a shared recipe into my own library, so that I can edit and own a version of it.
- **US-B8:** As User B, I want to control whether tags from shared recipes are merged into my own tag list, so that my tag view stays organised the way I want.
- **US-B9:** As User B, I want a shared collection to silently disappear from my UI when access is revoked, so that I am not interrupted by jarring notifications.

---

## 3. Functional Requirements

### 3.1 Invitation & Access Lifecycle
- **FR-01:** User A can initiate a library share by entering an email address in `/settings` under the section "Bibliothek teilen".
- **FR-02:** If the entered email belongs to an existing registered user, the system creates a `library_share` record with status `pending` and sends an in-app + email notification to that user prompting them to accept or decline.
- **FR-03:** If the entered email does NOT belong to a registered user, the system creates a `library_share` record with status `pending` and sends an email containing a registration link. Upon successful registration via that link, the share is automatically transitioned to `pending` against the new user account, who must then explicitly accept or decline.
- **FR-04:** Acceptance of a pending invitation by User B transitions the share status to `accepted` and grants read access. Declining transitions it to `declined` and revokes any potential access.
- **FR-04b:** User B can leave an `accepted` share at any time from their inbound-shares UI. This transitions the share status to `left`, silently removes the collection from User B's UI, and silently removes User B from User A's outbound list. Recipes User B had already duplicated are unaffected.
- **FR-05:** User A can revoke an `accepted` or `pending` share at any time, transitioning the status to `revoked`. Revoked shares are removed from User B's UI silently (no notification, no toast). Recipes User B had already duplicated remain in User B's library.
- **FR-05b:** Invitation sending is rate-limited to **5 invitations per user per calendar day (UTC)**. Exceeding this limit returns `HTTP 429` with the German error: `"Du hast heute bereits 5 Einladungen gesendet. Bitte versuche es morgen erneut."`.
- **FR-06:** A user may have an unlimited number of concurrent outbound shares (User A sharing with many) and inbound shares (User B receiving from many). There is no system-imposed limit.

### 3.2 Recipe Visibility Rules
- **FR-07:** By default, every recipe owned by User A is included in the shared view of any User B with `accepted` status.
- **FR-08:** User A can mark individual recipes as private via a per-recipe toggle (e.g. on the recipe detail/edit page). Private recipes are excluded from ALL active shares.
- **FR-09:** The private flag is a single boolean per recipe (not per-share). Privacy is global across all of User A's shares.
- **FR-10:** When User A marks a previously-shared recipe as private, it disappears from User B's view immediately on next reload.
- **FR-11:** Shared recipes are displayed to User B with all owner-visible fields: title, description, ingredients, steps, sections, images, step images, source (`source_type` + `source_value` + `source_title`), tags, nutrition values, favorite flag, recipe type, scalable flag, prep/cook time, servings.

### 3.3 Recipient Permissions
- **FR-12:** User B has read-only access to shared recipes. User B cannot edit, delete, or modify any field of a recipe owned by User A.
- **FR-13:** User B can copy/duplicate a shared recipe into their own library. The duplicated recipe becomes a fully-owned recipe of User B with:
  - A new `id` (uuid).
  - `user_id` set to User B.
  - `source_type` and `source_value` preserved from the original (per existing source-required rule).
  - `source_title` may be appended with a marker, e.g. `"(kopiert aus Sammlung von <User A's display name or email>)"`.
  - `created_at` set to the time of duplication.
  - `favorite` reset to false.
  - All other fields copied verbatim, including images (image URLs are copied by reference; the underlying file is not re-uploaded).
- **FR-14:** Duplicated recipes are subject to User B's own quotas (e.g. import day-limit does NOT apply to copies — copies are a distinct operation).
- **FR-15:** User B's shopping-list entries derived from a shared recipe persist locally even if the share is revoked (since the shopping list is localStorage-based).
- **FR-16:** User B can NOT cook-mode, share-link, or PDF-export a shared recipe unless they first duplicate it into their own library. (Decision: **read-only view only**; the cook mode, sharing, and export are owner-only actions. *This is a derived consequence of the read-only rule; if stakeholders later wish to relax this, it should be raised as a new requirement.*)

### 3.4 Re-sharing
- **FR-17:** User B can re-share a library they have access to with another user (User C), but only after User A grants explicit consent for that specific re-share.
- **FR-18:** The re-share request flow:
  1. User B initiates a re-share from "Geteilte Sammlungen" → contextual action "An weitere Person weitergeben".
  2. User B enters User C's email.
  3. The system creates a `library_share_reshare_request` with status `pending_owner_consent`.
  4. User A receives an email + in-app notification: "User B möchte deine Sammlung mit <C@example.com> teilen. Zustimmen oder ablehnen?"
  5. On approval, a new direct `library_share` record from User A → User C is created with status `pending` (User C still must accept).
  6. On rejection, the request is closed; User B and (if applicable) User C are not notified of the rejection beyond a generic UI status.
- **FR-19:** Re-shared chains are flat: every accepted share is a direct A→X relationship; there is no transitive trust. Revoking A→B does not revoke A→C.

### 3.5 Search, Filter, Tags
- **FR-20:** Within "Geteilte Sammlungen", User B has full search, filter, and tag functionality identical to their own library.
- **FR-21:** When viewing the merged/filtered own-recipe-list (with shared section toggled on), search and filter operate across all visible recipes (own + shared).
- **FR-22:** **Tag merging behaviour** (controlled by a user setting, see §9):
  - **Default:** Tags from shared recipes are merged into User B's global tag view (i.e. tag chips, tag filter dropdowns include tags from both own and shared recipes).
  - When the user toggles the setting OFF, tags from shared recipes are visible only in the shared-collection scope, and User B's global tag list is restricted to their own recipes.
- **FR-23:** Tag normalisation rules (existing) apply equally; no special transformation of tags from shared recipes is performed.

### 3.6 Notifications
- **FR-24:** Email notifications are sent on the following events ONLY:
  - User A invites User B (email to User B with invitation or registration link).
  - User B accepts an invitation (email to User A).
  - User A approves a re-share request (email to User B confirming, and email to User C with invitation).
- **FR-25:** No email notifications are sent on revoke, decline, recipe-marked-private, or recipe-deleted events.

---

## 4. Data Model Changes

### 4.1 New Table: `library_shares`
Tracks the persistent A→B sharing relationship.

```sql
create table library_shares (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  owner_id        uuid not null references auth.users(id) on delete cascade,
  -- recipient_id is null until the invitee registers (for email-only invites)
  recipient_id    uuid references auth.users(id) on delete cascade,
  recipient_email text not null,

  status          text not null check (status in (
                    'pending',     -- invitation sent, awaiting acceptance
                    'accepted',    -- active share
                    'declined',    -- recipient declined the initial invitation
                    'left',        -- recipient left an accepted share voluntarily
                    'revoked'      -- owner or system revoked
                  )),

  invitation_token  text unique,    -- used in email registration link; nullable after acceptance
  invited_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  declined_at       timestamptz,
  revoked_at        timestamptz,

  unique (owner_id, recipient_email)  -- one active invitation per email per owner
);

create index library_shares_owner_idx     on library_shares(owner_id);
create index library_shares_recipient_idx on library_shares(recipient_id);
create index library_shares_status_idx    on library_shares(status);

create trigger library_shares_updated_at
  before update on library_shares
  for each row execute function set_updated_at();
```

**Cascade rules (per stakeholder decision 12):**
- `owner_id … on delete cascade` — when User A is deleted, all their share records are removed; User B loses access immediately on next reload (silent disappear, per FR-09).
- `recipient_id … on delete cascade` — when User B is deleted, the share record is removed; User A's "Geteilte mit"-list no longer shows that invitee.

### 4.2 New Table: `library_share_reshare_requests`
Tracks User B's request to re-share, awaiting User A's consent.

```sql
create table library_share_reshare_requests (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  parent_share_id     uuid not null references library_shares(id) on delete cascade,
  requested_by_id     uuid not null references auth.users(id) on delete cascade,
  target_email        text not null,

  status              text not null check (status in (
                        'pending_owner_consent',
                        'approved',
                        'rejected',
                        'cancelled'
                      )),
  resolved_at         timestamptz,
  resulting_share_id  uuid references library_shares(id) on delete set null
);

create index lsrr_parent_idx    on library_share_reshare_requests(parent_share_id);
create index lsrr_status_idx    on library_share_reshare_requests(status);
```

### 4.3 Changes to `recipes` Table
Add a per-recipe privacy flag (excludes the recipe from ALL of the owner's active shares).

```sql
alter table recipes
  add column is_private boolean not null default false;

create index recipes_is_private_idx on recipes(is_private);
```

### 4.4 Changes to User Profile / Settings
Add a per-user setting for tag-merging behaviour. If a `user_settings` table does not yet exist, create one:

```sql
create table if not exists user_settings (
  user_id                       uuid primary key references auth.users(id) on delete cascade,
  merge_shared_tags_into_global boolean not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create trigger user_settings_updated_at
  before update on user_settings
  for each row execute function set_updated_at();
```

### 4.5 Row-Level Security (RLS) Policies

**`recipes` — extend existing owner-only policies to allow read access by accepted recipients.**

```sql
-- SELECT: owner OR accepted-share recipient (and recipe not private)
create policy recipes_select_owner_or_shared on recipes
  for select using (
    user_id = auth.uid()
    or (
      is_private = false
      and exists (
        select 1 from library_shares ls
        where ls.owner_id     = recipes.user_id
          and ls.recipient_id = auth.uid()
          and ls.status       = 'accepted'
      )
    )
  );

-- INSERT/UPDATE/DELETE: owner only (unchanged)
create policy recipes_modify_owner_only on recipes
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

**`library_shares` — both parties can read; only owner can modify.**

```sql
create policy library_shares_select_party on library_shares
  for select using (owner_id = auth.uid() or recipient_id = auth.uid());

create policy library_shares_insert_owner on library_shares
  for insert with check (owner_id = auth.uid());

create policy library_shares_update_owner on library_shares
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Recipient may UPDATE only the status field to transition pending → accepted/declined.
-- This is best enforced server-side via a dedicated API route rather than RLS.

create policy library_shares_delete_owner on library_shares
  for delete using (owner_id = auth.uid());
```

**`library_share_reshare_requests` — readable by requester and parent-share owner; writable by requester (insert) and owner (resolve).**

```sql
create policy lsrr_select on library_share_reshare_requests
  for select using (
    requested_by_id = auth.uid()
    or exists (
      select 1 from library_shares ls
      where ls.id = parent_share_id and ls.owner_id = auth.uid()
    )
  );

create policy lsrr_insert_requester on library_share_reshare_requests
  for insert with check (requested_by_id = auth.uid());

-- UPDATE allowed for parent-share owner (to approve/reject) and requester (to cancel).
create policy lsrr_update on library_share_reshare_requests
  for update using (
    requested_by_id = auth.uid()
    or exists (
      select 1 from library_shares ls
      where ls.id = parent_share_id and ls.owner_id = auth.uid()
    )
  );
```

**`user_settings` — owner only.**

```sql
create policy user_settings_owner on user_settings
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

---

## 5. New API Routes

All routes are under `/app/api/library-shares/` and follow the project convention of returning `{ data, error }`.

### 5.1 Outbound (Owner) — Managing My Shares
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/library-shares` | Create a new library-share invitation. Body: `{ recipient_email }`. Server resolves whether the email already belongs to a registered user, creates the row with status `pending`, generates an `invitation_token`, sends the appropriate email. |
| `GET`  | `/api/library-shares` | List all shares where current user is `owner_id`. Returns status, recipient email, recipient display name (if registered), timestamps. |
| `DELETE` | `/api/library-shares/[id]` | Revoke a share (owner only). Sets status = `revoked`, `revoked_at = now()`. |

### 5.2 Inbound (Recipient) — Shares Granted to Me
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/library-shares/incoming` | List all shares where current user is `recipient_id`. Includes pending invitations and accepted shares. |
| `POST` | `/api/library-shares/[id]/accept` | Recipient accepts a pending invitation. Transitions to `accepted`, sets `accepted_at`, sends notification email to owner. |
| `POST` | `/api/library-shares/[id]/decline` | Recipient declines a pending invitation. Transitions to `declined`. No email sent. |

### 5.3 Invitation Token Resolution
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/library-shares/invitation/[token]` | Public route. Resolves an invitation token to invitation metadata (owner display name, recipient email). Used by the registration flow to link a newly-registered account to a pending invitation. |
| `POST` | `/api/library-shares/invitation/[token]/claim` | Called after registration. Authenticated. Sets `recipient_id = auth.uid()` for the share record matching the token, leaves status as `pending` (recipient still must accept). |

### 5.4 Re-share Requests
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/library-shares/[id]/reshare` | Recipient creates a re-share request. Body: `{ target_email }`. Status = `pending_owner_consent`. Email sent to original owner. |
| `GET`  | `/api/library-shares/reshare-requests` | List re-share requests relevant to the current user (as requester or as parent-share owner). |
| `POST` | `/api/library-shares/reshare-requests/[id]/approve` | Original owner approves. Creates a new direct `library_shares` row owner→target with status `pending`. Email sent to target. |
| `POST` | `/api/library-shares/reshare-requests/[id]/reject` | Original owner rejects. |
| `POST` | `/api/library-shares/reshare-requests/[id]/cancel` | Requester cancels their own pending request. |

### 5.5 Recipe Privacy Toggle
Use the existing `PATCH /api/recipes/[id]` route. Add `is_private` to allowed body fields. No new route required.

### 5.6 Recipe Duplication (Copy)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/recipes/[id]/duplicate` | Authenticated. Creates a deep copy of the recipe into the caller's library, provided the caller has read access (owner or accepted recipient). Returns the new recipe id. Bypasses the import day-limit (copies are not imports). |

### 5.7 User Settings
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/settings` | Return the current user's settings (creating a default row on first call). |
| `PATCH` | `/api/settings` | Update settings. Body: `{ merge_shared_tags_into_global }`. |

---

## 6. UI/UX Requirements

### 6.1 Top-Level Navigation
- Add a new top-level navigation entry **"Geteilte Sammlungen"** alongside the existing "Meine Rezepte", "Einkaufsliste", etc.
- The nav item is shown only if the current user has at least one `accepted` inbound share.
- Clicking opens an index page listing each shared library by owner display name (or email fallback). Each entry is a card showing owner name, recipe count, and last-updated timestamp.
- Clicking a shared library opens a recipe-list view scoped to that owner's shared recipes, visually labelled with a banner: **"Geteilte Sammlung von <Display-Name>"**.

### 6.2 Filter / Section in Existing Recipe List
- The existing "Meine Rezepte" list gains a filter chip / section toggle: **"Geteilte Rezepte einbeziehen"** (default: off).
- When active, shared recipes are merged into the list. Each shared-recipe card shows a small badge **"Geteilt von <Name>"** to distinguish ownership.
- All existing search/filter/tag controls operate over the merged list.

### 6.3 Invitation Flow (User A's Side)
Located at `/settings → "Bibliothek teilen"`:
1. Section header **"Bibliothek teilen"** with explanatory copy:
   _"Lade andere Personen ein, deine Rezeptsammlung anzusehen. Sie können deine Rezepte lesen und in ihre eigene Sammlung kopieren, aber nicht bearbeiten."_
2. Email input field + button **"Einladung senden"**.
3. Validation: non-empty, valid email, not the current user's own email, no existing non-revoked share for that email by this owner.
4. Below the form: a list of all current shares (table rows):
   - Recipient email + display name if known.
   - Status badge: **Ausstehend** / **Aktiv** / **Abgelehnt** / **Widerrufen**.
   - Invited date.
   - Action button **"Zugriff entziehen"** (only for `pending` and `accepted`).
5. Confirmation dialogue on revoke: _"Möchtest du <email> den Zugriff auf deine Sammlung wirklich entziehen?"_

### 6.4 Invitation Flow (User B's Side)
**Case A — Recipient is not registered:**
- Email contains a registration link with `invitation_token` as query param.
- Clicking opens `/register?invitation=<token>`. The form is pre-filled with the invited email (read-only).
- After successful registration, the system claims the invitation token (links share to new `recipient_id`) and redirects to `/library-shares/incoming` showing the pending invitation card.

**Case B — Recipient is already registered:**
- Email contains a link to `/library-shares/incoming` (login required).
- The same "incoming invitation" card appears in their app.

**Incoming invitation card:**
- Shows owner display name + email.
- Two buttons: **"Annehmen"** and **"Ablehnen"**.
- Optional explanatory text: _"<Owner-Name> möchte seine/ihre Rezeptsammlung mit dir teilen. Du erhältst Lesezugriff auf alle Rezepte (außer als privat markierte)."_

### 6.5 Shared-Library Recipe Detail View
- Identical layout to the owner's recipe detail view (title, image, ingredients, steps, sections, source link, nutrition, tags, favorite indicator) — per stakeholder decision 4.
- All edit/delete controls are hidden.
- Cook-mode, PDF-export, and recipe-share buttons are hidden (read-only view; user must duplicate first).
- A prominent button **"In meine Sammlung kopieren"** is shown.
- Shopping-list "add ingredients" remains available (shopping list is localStorage-scoped to User B).

### 6.6 Recipe Privacy Toggle (Owner)
- On the recipe edit page, add a toggle **"Privat (nicht teilen)"**.
- Tooltip: _"Wenn aktiviert, ist dieses Rezept in deinen geteilten Sammlungen nicht sichtbar."_
- Toggle is also surfaced as a quick-action on the recipe detail page (owner only).

### 6.7 Re-share UI
- On the shared-library detail view, User B sees a button **"An weitere Person weitergeben"**.
- Clicking opens a dialogue requesting target email and explanatory text:
  _"<Owner-Name> muss zustimmen, bevor <target> Zugriff erhält."_
- After submission, status is shown in the user's "Geteilte Sammlungen → Weitergaben"-section.

### 6.8 Owner — Re-share Approval UI
- On `/settings → Bibliothek teilen`, an additional section **"Weitergabe-Anfragen"** lists pending re-share requests.
- Each row: requester (User B) name + email, target (User C) email, request date, **"Genehmigen"** / **"Ablehnen"** buttons.

### 6.9 Loading & Empty States
- Empty inbound: _"Du hast noch keine geteilten Sammlungen erhalten."_
- Empty outbound: _"Du hast deine Bibliothek noch mit niemandem geteilt."_
- Loading skeletons consistent with existing recipe-list patterns.

---

## 7. Email Notifications

All emails sent via the project's email provider (e.g. Supabase Auth email or transactional service). Subject and body are German.

### 7.1 Invitation to Unregistered Recipient
- **Trigger:** User A creates a share for an email not yet registered.
- **Subject:** `<Owner-Name> hat dich eingeladen, seine/ihre Rezeptsammlung anzusehen`
- **Body (HTML + plaintext):**
  - Greeting + explanation.
  - CTA link: `{APP_URL}/register?invitation={token}` — _"Jetzt registrieren und Sammlung ansehen"_.
  - Hint: After registration, User B can still accept or decline.
  - Footer: contact / unsubscribe info as required.

### 7.2 Invitation to Registered Recipient
- **Trigger:** User A creates a share for an already-registered email.
- **Subject:** `<Owner-Name> möchte seine/ihre Rezeptsammlung mit dir teilen`
- **Body:**
  - CTA link: `{APP_URL}/library-shares/incoming` — _"Einladung ansehen"_.
  - Explanatory text on read-only access.

### 7.3 Acceptance Notification to Owner
- **Trigger:** User B accepts a pending invitation (status pending → accepted).
- **Subject:** `<Recipient-Name> hat deine Einladung angenommen`
- **Body:**
  - Confirmation that User B now has read access.
  - Link to `/settings → Bibliothek teilen`.

### 7.4 Re-share Consent Request to Owner
- **Trigger:** User B creates a `library_share_reshare_request`.
- **Subject:** `<User-B-Name> möchte deine Sammlung mit <C-Email> teilen`
- **Body:**
  - Explanation of the re-share request.
  - CTA link to `/settings → Bibliothek teilen → Weitergabe-Anfragen`.

### 7.5 Re-share Approval Confirmation to Requester
- **Trigger:** Owner approves a re-share request.
- **Subject:** `<Owner-Name> hat deiner Weitergabe zugestimmt`
- **Body:** Confirmation that the new direct share to User C has been initiated.

### 7.6 Re-share Initiation to Target (User C)
- **Trigger:** Owner approves a re-share request → new `library_shares` row created.
- Behaves exactly like §7.1 or §7.2 depending on whether User C is already registered. The email may include a hint that the share was initiated via User B's request.

### 7.7 Events That Do NOT Send Emails
- Decline of an invitation.
- Revocation of access.
- Recipe marked as private.
- Recipe deleted.
- Re-share request rejected or cancelled.
- User account deletion (cascade revoke).

---

## 8. Edge Cases & Error Handling

### 8.1 Account Deletion (per stakeholder decision 12)
- **User A is deleted:** `library_shares.owner_id … on delete cascade` removes all of User A's share rows. User B's UI: shared collection silently disappears on next reload (no notification, per FR-05). Recipes User B had already duplicated remain in User B's library unaffected (they are fully owned by User B at that point).
- **User B is deleted:** `library_shares.recipient_id … on delete cascade` removes all of User B's incoming share rows. User A's "Geteilte mit"-list no longer shows that invitee on next reload.

### 8.2 Recipe Deletion by Owner
- When User A deletes a recipe, it disappears from all User B views immediately on next reload. No notification.

### 8.3 Recipe Marked as Private After Sharing
- The recipe disappears from all User B views immediately on next reload. No notification.
- User B's previously-copied/duplicated version (if any) is fully owned by User B and remains unaffected by any privacy or revocation action.

### 8.4 Inviting an Email That Is Already Pending or Accepted
- API returns `400` with German error: `"Für diese E-Mail-Adresse besteht bereits eine Einladung oder ein aktiver Zugriff."`.

### 8.5 Inviting Self
- API returns `400`: `"Du kannst deine Bibliothek nicht mit dir selbst teilen."`.

### 8.6 Accepting an Already-Revoked Invitation
- If User A revokes a `pending` share before User B accepts, and User B then attempts to accept:
- API returns `410 Gone`: `"Diese Einladung ist nicht mehr gültig."`.

### 8.7 Registration Token Reuse
- An invitation token is single-use. Once claimed (linked to a `recipient_id`), the token is invalidated (set `invitation_token = null` post-claim).
- If a user clicks an old invitation link after acceptance, they are redirected to `/library-shares/incoming` with an info banner.

### 8.8 Recipient Email Mismatch on Registration
- If User B registers via the invitation link but uses a different email than the invited one, the invitation is still claimed (linking by token, not by email). This is documented as the intended behaviour to keep onboarding frictionless.

### 8.9 Re-share Without Active Parent Share
- If User A revokes the parent share while a re-share request is `pending_owner_consent`, the request is auto-cancelled (status → `cancelled`).

### 8.10 Concurrency: Two Tabs
- All UI mutations (accept, decline, revoke) are idempotent; the server returns the current canonical state. UI re-renders accordingly.

### 8.11 Tag Merge Setting Toggle
- Toggling the `merge_shared_tags_into_global` setting takes effect immediately on next page reload / re-fetch. No data migration required.

### 8.12 Duplicating a Recipe with Step Images / Photos
- Image URLs are copied by reference (string copy of the public URL). The underlying file is NOT re-uploaded. If User A later deletes the source image, User B's copy will display a broken image — this is accepted behaviour (documented limitation).

### 8.13 Import Day-Limit
- The 20/day import limit does NOT apply to the duplicate operation, since it is not an import.

### 8.14 RLS Edge: Pending Share Read Access
- A `pending` share grants NO read access to recipes. Read access is gated on `status = 'accepted'` only (per RLS policy in §4.5).

---

## 9. Settings (`/settings → "Bibliothek teilen"`)

The Settings page gains a new section, structured as:

### 9.1 Section: "Bibliothek teilen"
- **Subsection A — Geteilt mit (outgoing):**
  - Email input + "Einladung senden" button (FR-01).
  - List of all outbound shares with status badges and "Zugriff entziehen" actions (§6.3).
- **Subsection B — Weitergabe-Anfragen (re-share approvals):**
  - List of pending re-share requests targeting the current user as parent-share owner.
  - "Genehmigen" / "Ablehnen" buttons per row.
- **Subsection C — Tag-Einstellungen:**
  - Toggle: **"Tags aus geteilten Sammlungen in meiner globalen Tag-Liste anzeigen"**
  - Default: ON (true).
  - Tooltip: _"Wenn aktiviert, erscheinen Tags von Rezepten aus mit dir geteilten Sammlungen in deiner globalen Tag-Filterleiste. Wenn deaktiviert, sind sie nur innerhalb der jeweiligen geteilten Sammlung sichtbar."_
  - Persisted in `user_settings.merge_shared_tags_into_global`.

### 9.2 Section: Inbound shares
- A separate section (still in `/settings` or alternatively on the dedicated `/library-shares/incoming` page) lists incoming shares and allows the user to leave a shared collection (functional equivalent to the owner revoking — but initiated by the recipient). On leaving, the share status transitions to a new `left` status (distinct from `declined`, to differentiate a recipient-initiated exit from declining an initial invitation).

---

## 10. Out of Scope

The following are explicitly NOT included in this feature:

- **Granular per-recipe sharing.** This feature shares the entire library minus privacy-flagged recipes; per-recipe selection is not supported.
- **Per-share recipe selection / tagging.** Privacy is global; one cannot share recipe X only with User B and recipe Y only with User C.
- **Write access for recipients.** Recipients cannot edit, delete, or comment on shared recipes.
- **Group / household entities.** Sharing remains a 1-to-1 relationship between two users. Multi-user "household" objects are deferred.
- **Public discoverability.** Shared collections are not searchable or discoverable; they only become visible upon explicit invitation + acceptance.
- **Activity feeds / notifications beyond the four email events** specified in §7.
- **In-app push notifications.** Only email + the standard incoming-invitations UI badge are in scope.
- **Recipe-level analytics for owners** (e.g. "User B viewed your recipe").
- **Bulk invitation upload** (CSV import of email addresses).
- **Time-limited / expiring shares.** All active shares persist indefinitely until revoked.
- **Sharing of shopping lists, meal plans, or settings** between users.
- **Existing Feature 05 token-based public-link sharing remains unchanged** and operates independently.
- **Comments / chat on shared recipes.**
- **Multilingual email templates.** Emails are German only.

---

## 11. Resolved Questions

All open questions from the initial draft have been resolved by the stakeholder:

| # | Question | Decision |
|---|----------|----------|
| OQ-1 | Can User B leave a shared collection from their side? | **Yes.** Status transitions to a new `left` state (distinct from `declined`). |
| OQ-2 | Should User A see when User B copies a recipe? | **No.** Copy actions are not surfaced to the owner. |
| OQ-3 | Display name fallback when User A has no display name? | **Email address** (confirmed default). |
| OQ-4 | Rate-limit on invitation sending? | **5 invitations per user per day.** API returns `429` with German error on breach. |
| OQ-5 | Flag User B's shopping list entries on revocation? | **No.** Silently persist (confirmed default). |
| OQ-6 | Owner sees registration status in outbound list? | **Yes.** Status badges differentiate `pending_unregistered` from `pending` (confirmed default). |

**Additional stakeholder decision:** If User B has already duplicated (copied) recipes from User A's library and User A later revokes access, **User B retains all previously copied recipes** in their own library. Copied recipes are fully owned by User B at the point of duplication; revocation has no retroactive effect on copies. (See also §8.1 and §8.3.)

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Owner / User A / Sharer** | The user whose library is being shared. |
| **Recipient / User B** | The user receiving read access to another user's library. |
| **Library Share** | The persistent A→B sharing relationship represented by a `library_shares` row. |
| **Geteilte Sammlung** | UI label for a shared library as seen by the recipient. |
| **Privacy Flag** | The boolean `recipes.is_private` excluding a recipe from all of an owner's shares. |
| **Re-share** | User B's request to extend access to a third user, requiring the original owner's explicit approval. |
| **Duplicate / Copy** | The action by which User B creates an independently-owned copy of a shared recipe in their own library. |
| **Tag Merging** | The behaviour of including tags from shared recipes in the recipient's global tag view, controlled by `user_settings.merge_shared_tags_into_global`. |
