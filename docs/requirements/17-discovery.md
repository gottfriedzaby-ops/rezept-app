# Feature 17 — Discovery: Ratings, Notes, Cooked Counter, Collections

|               |                                                                        |
| ------------- | ---------------------------------------------------------------------- |
| ID            | 17                                                                     |
| Status        | ✅ Shipped (2026-06-11)                                                |
| Priority      | Medium                                                                 |
| Effort        | M                                                                      |
| Components    | `components/RecipeRating.tsx`, `components/RecipeNotes.tsx`, `components/CollectionPicker.tsx`, `components/CollectionManager.tsx`, `app/[locale]/collections/`, `app/api/collections/`, `app/api/recipes/[id]/cooked/` |
| Schema change | Yes — `supabase/migrations/20260611000004_feature17_discovery.sql`     |
| Dependencies  | Feature 05 (Auth)                                                      |

## Overview

Personal curation on top of the growing library: a 1–5 star rating and free-text
notes per recipe (owner only), an automatic „gekocht"-counter fed by CookMode,
and user-defined collections (folders) for organising recipes. The cooked/rating
signals also feed the AI assistant's week suggestions (Feature 18).

## User Stories

1. *„War das Rezept gut? Ich koche so viel, ich vergesse es."* — Owner rates a
   recipe (stars on the detail page) and sorts the library by „Beste Bewertung".
2. *„Beim nächsten Mal weniger Salz."* — Personal notes on the detail page,
   max 2000 chars, saved explicitly.
3. *„Was koche ich ständig?"* — CookMode's „Fertig" button increments
   `cooked_count` + `last_cooked_at`; the badge appears in the detail meta row.
4. *„Alle Weihnachtsrezepte an einem Ort."* — Collections: create/delete on
   `/collections`, add/remove recipes via the picker on the detail page,
   browse a collection as a filtered recipe grid.

## Functional Requirements

- **FR-17-1** Rating 1–5 or null (click active star to clear); owner only;
  validated in `PATCH /api/recipes/[id]`.
- **FR-17-2** Notes ≤ 2000 chars or null; owner only; same PATCH whitelist.
- **FR-17-3** `POST /api/recipes/[id]/cooked` increments the counter, owner
  scoped, silent no-op (200) until the migration is applied (42703).
- **FR-17-4** Sort option „Beste Bewertung" (`sort=rating`, NULLS LAST) in
  server and client list modes; rating shown on list cards (★ n).
- **FR-17-5** Collections are per-user, names unique per user (1–100 chars,
  409 on duplicates); deleting a collection never deletes recipes.
- **FR-17-6** Membership add is idempotent; only own recipes can be added.

## Security

- `PATCH`/`DELETE /api/recipes/[id]` are now **owner-scoped** (`user_id`
  filter + 404). Previously any signed-in user could modify/delete foreign
  recipes by id — fixed as part of this feature.
- Collections RLS: owner-only on `collections`; `collection_recipes` via
  EXISTS on the parent collection.

## Data Model

```sql
ALTER TABLE recipes ADD rating int CHECK 1..5, notes text,
  cooked_count int DEFAULT 0, last_cooked_at timestamptz;
collections(id, created_at, user_id, name, UNIQUE(user_id, name))
collection_recipes(collection_id, recipe_id, added_at, PK(collection_id, recipe_id))
```

## Tests

`__tests__/api/recipes-id.test.ts` (ownership + validation),
`__tests__/api/recipes-cooked.test.ts`, `__tests__/api/collections.test.ts`,
`__tests__/components/RecipeRating.test.tsx`,
`__tests__/components/CollectionPicker.test.tsx`.
