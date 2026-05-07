# Feature 11 — Unified Library Display for Shared Recipes

## Overview

Previously, shared recipes (from accepted library shares) were accessible only via the dedicated `/library-shares/` hub. This feature integrates them into the user's main recipe library by default, distinguishing them with a visual badge. The existing settings toggle is repurposed to let users choose between this unified view and a private-only view.

---

## Business Requirements

| ID | Requirement |
|----|-------------|
| BR-01 | Users with accepted library shares should be able to see shared recipes alongside their own in a single, unified view. |
| BR-02 | Shared recipes must be visually distinguishable from own recipes at a glance. |
| BR-03 | Users who prefer to keep their library clean should be able to opt out of the unified view. |
| BR-04 | The `/library-shares/` hub remains accessible for per-owner browsing regardless of toggle state. |

---

## Functional Requirements

### Main Library Display

| ID | Requirement |
|----|-------------|
| FR-01 | When `show_shared_in_main_library` is `true` (default), the main recipe list at `/` displays own recipes and shared recipes in a single unified grid. |
| FR-02 | When `show_shared_in_main_library` is `false`, the main recipe list shows only the user's own recipes. |
| FR-03 | The unified list is sorted by `created_at` descending across both own and shared recipes. |

### Shared Recipe Badge

| ID | Requirement |
|----|-------------|
| FR-04 | In the unified view, shared recipe cards display a badge in the top-right corner of the recipe image. |
| FR-05 | The badge consists of a "people" icon and the owner's display name (truncated if too long). |
| FR-06 | The badge has a tooltip on hover showing "Geteilt von [Displayname]". |
| FR-07 | Shared recipe cards do not show the favorite button (only own recipes have a favorite toggle). |
| FR-08 | Clicking a shared recipe card in the unified list opens its read-only detail view at `/library-shares/[ownerId]/[recipeId]`. |

### Settings Toggle

| ID | Requirement |
|----|-------------|
| FR-09 | The DB column `merge_shared_tags_into_global` in `user_settings` is renamed to `show_shared_in_main_library`. |
| FR-10 | The default value for all users (new and existing) is `true` (unified view enabled). |
| FR-11 | The toggle is located in Settings under the section heading "Bibliotheksansicht". |
| FR-12 | The toggle label is: *"Geteilte Rezepte in meiner Bibliothek anzeigen"* |
| FR-13 | The toggle description is: *"Wenn aktiviert, erscheinen Rezepte aus mit dir geteilten Sammlungen gemeinsam mit deinen eigenen Rezepten in der Bibliothek – erkennbar an einem Badge mit dem Namen der Person. Wenn deaktiviert, sind sie nur unter „Geteilte Sammlungen" erreichbar."* |

### Tag Cloud

| ID | Requirement |
|----|-------------|
| FR-14 | When `show_shared_in_main_library` is `true`, tags from shared recipes are included in the tag cloud filter (they are part of the unified filtered list). |
| FR-15 | When `show_shared_in_main_library` is `false`, tags from shared recipes are not included in the tag cloud (shared recipes are not passed to RecipeList at all). |
| FR-16 | Tag cloud inclusion follows automatically from the display toggle — there is no separate tag-merge setting. |

### Filtering

| ID | Requirement |
|----|-------------|
| FR-17 | In the unified view, search, tag filter, and recipe-type filter apply to own and shared recipes identically. |
| FR-18 | In the unified view, the favorites filter applies to own recipes only (shared recipes have no favorite state in the recipient's context and will not appear under favorites). |

### Read-only Behavior of Shared Recipes

| ID | Requirement |
|----|-------------|
| FR-19 | Shared recipes are read-only; the recipient cannot edit or delete them from the unified view. |
| FR-20 | The read-only detail view for shared recipes (at `/library-shares/[ownerId]/[id]`) provides "Add to Shopping List" and "Copy to Library" actions, unchanged from existing behavior. |

### `/library-shares/` Hub

| ID | Requirement |
|----|-------------|
| FR-21 | The `/library-shares/` hub and individual collection views remain accessible by URL regardless of toggle state. |
| FR-22 | The "Geteilte Sammlungen" navigation link in `UserNav` is shown **only** when `show_shared_in_main_library` is `false` and the user has at least one accepted share. |
| FR-23 | When `show_shared_in_main_library` is `true`, the hub link is hidden from the nav (shared recipes are already visible in the main library). |

### Public Share Links

| ID | Requirement |
|----|-------------|
| FR-24 | Public share links (`/shared/[token]`) are unaffected by this feature. |

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | The settings fetch in `UserNav` is done in parallel with the existing incoming-shares fetch to avoid added latency. |
| NFR-02 | The `show_shared_in_main_library` default is applied via upsert in `GET /api/settings` so new users automatically get the unified view. |
| NFR-03 | The badge is visually unobtrusive: semi-transparent white background, small text, max-width with truncation. |

---

## User Stories

### US-01 — Unified Library (default)
*As a user with accepted library shares, I want to see all recipes (own + shared) together in my library so that I can search and filter across everything in one place.*

**Acceptance Criteria:**
- [ ] Shared recipe cards appear in the main grid at `/`
- [ ] Each shared card has an owner badge (top-right, icon + name, tooltip)
- [ ] Search, tag, and type filters work across own + shared recipes
- [ ] Shared recipe cards link to the read-only detail view

### US-02 — Private View
*As a user, I want the option to hide shared recipes from my main library so that I can keep my own collection clean.*

**Acceptance Criteria:**
- [ ] Toggling off in Settings → Bibliotheksansicht hides shared recipes from `/`
- [ ] The "Geteilte Sammlungen" nav link reappears
- [ ] Shared recipes remain accessible at `/library-shares/`

### US-03 — Tag Cloud
*As a user, I want the tag cloud to reflect only what's currently shown so that filtering stays relevant.*

**Acceptance Criteria:**
- [ ] With unified view ON: shared recipe tags appear in the tag cloud
- [ ] With unified view OFF: only own recipe tags appear

### US-04 — Favorites Filter
*As a user, I want the favorites filter to apply to my own recipes without breaking the unified view.*

**Acceptance Criteria:**
- [ ] Favorites filter hides shared recipes (they have no favorite state)
- [ ] Own favorited recipes are still shown correctly

### US-05 — Hub Access
*As a user, I want to still browse recipes by owner (e.g., "show me everything from Anna") even when the unified view is on.*

**Acceptance Criteria:**
- [ ] `/library-shares/[ownerId]` still works by URL in unified view mode
- [ ] Hub is still navigable from Settings page (IncomingSharesManager links)

---

## Out of Scope

- Favoriting shared recipes on behalf of the recipient
- Sorting unified list by owner
- Hiding specific shared users from the unified view
- Any changes to public share links (`/shared/[token]`)

---

## Migration Notes

Run the following SQL in the Supabase SQL editor (or via `npx supabase db push`):

```sql
ALTER TABLE user_settings
  RENAME COLUMN merge_shared_tags_into_global TO show_shared_in_main_library;
```

Existing values carry over unchanged. Since the old default was `true` and the new semantics also default to `true`, existing users retain their effective behavior.

---

## Glossary

| Term | Definition |
|------|-----------|
| Library share | A relationship where one user grants another read access to their recipe library |
| Unified view | The mode where own and shared recipes appear together in the main library |
| Private-only view | The mode where only own recipes appear in the main library |
| Badge | The visual indicator on shared recipe cards showing the owner's name |
