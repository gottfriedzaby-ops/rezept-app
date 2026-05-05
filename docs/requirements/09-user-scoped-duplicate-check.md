# Requirements: User-Scoped Duplicate Check

**Status:** Draft
**Author:** Requirements Engineer
**Date:** 2026-05-05
**Version:** 1.0

## 1. Overview

The recipe import pipeline currently performs a three-stage duplicate check (exact `source_value` match → normalized URL match → fuzzy Jaccard title similarity ≥ 0.85) globally across the `recipes` table. With multi-user authentication now live, this global scope causes false positives: User A is blocked from importing a recipe because User B already has it in their personal collection.

This feature changes the duplicate check so that all three stages only consider recipes owned by the **currently authenticated user**. Each user's library is treated as an independent namespace for the purpose of duplicate detection. A user can never be blocked or warned about another user's recipes.

The change applies to all import routes (`/api/import-url`, `/api/import-youtube`, `/api/import-photo`, `/api/import-instagram`) and to the final save step (`/api/recipes/confirm`).

## 2. Business Requirements

- **BR-01** Each authenticated user must be able to import any recipe into their own collection without being blocked by another user's collection.
- **BR-02** Within a single user's own collection, the existing protection against accidental duplicate imports must remain fully intact (same algorithm, same thresholds).
- **BR-03** No data migration is required. Legacy NULL-`user_id` rows have already been removed manually from the database; the duplicate check must simply ignore any rows it cannot attribute to the current user.

## 3. Functional Requirements

### Scoping behavior

- **FR-01** All duplicate-check database queries must filter recipes by `user_id = <current authenticated user id>`.
- **FR-02** The current user id must be supplied by the calling API route (the route already authenticates the request and knows the user). Duplicate-check functions must not attempt to derive the user id themselves.
- **FR-03** If no authenticated user is available at the time of a duplicate-check call, no duplicate must be returned (the request should already have been rejected by auth middleware; the duplicate check itself must not fall back to a global query).

### Stage 1 — Exact `source_value` match

- **FR-04** The exact-match query against `recipes.source_value` must additionally filter by `user_id = currentUserId`.
- **FR-05** This applies both to `checkUrlDuplicate` (early-exit before Claude calls) and to `findDuplicateRecipe` (post-parse final check).

### Stage 2 — Normalized URL match

- **FR-06** The hostname-prefiltered candidate query (`ilike("source_value", "%hostname%")`) must additionally filter by `user_id = currentUserId`.
- **FR-07** URL normalization rules (lowercase, strip trailing slash, drop tracking params `utm_*`, `ref`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `igshid`, `s`, drop hash, sort search params) remain unchanged.

### Stage 3 — Fuzzy title match (Jaccard ≥ 0.85)

- **FR-08** The title-prefiltered candidate query (`ilike("title", "%longestWord%")` LIMIT 20) must additionally filter by `user_id = currentUserId`.
- **FR-09** The Jaccard similarity threshold (0.85), tokenization rules, and the 20-row candidate cap remain unchanged.
- **FR-10** Stage 3 continues to run for all source types, including `photo`, `manual`, and entries where `source_value` is a non-URL string (e.g., a YouTube video id, an Instagram shortcode, or a generated photo filename).

### Per-route integration

- **FR-11** `/api/import-url` must pass the current user id to both `checkUrlDuplicate` and `findDuplicateRecipe`.
- **FR-12** `/api/import-youtube` must pass the current user id to both `checkUrlDuplicate` and `findDuplicateRecipe`.
- **FR-13** `/api/import-instagram` must pass the current user id to both `checkUrlDuplicate` and `findDuplicateRecipe`.
- **FR-14** `/api/import-photo` must pass the current user id to both `findDuplicateRecipe` calls (early multi-image check at line 69 and post-review check at line 138).
- **FR-15** `/api/recipes/confirm` must pass the current user id to `findDuplicateRecipe`.

### Result semantics

- **FR-16** A `DuplicateResult` (with `existingRecipeId` and `existingTitle`) returned by either function is guaranteed to reference a recipe owned by the current user.
- **FR-17** The "View existing recipe" link presented to the user on a duplicate hit will therefore always resolve to a recipe the user is authorized to view.

## 4. Non-Functional Requirements

- **NFR-01 (Correctness / Privacy):** A user must never receive a `DuplicateResult` referencing another user's recipe id or title. This is a privacy boundary, not just a UX consideration.
- **NFR-02 (Performance):** Adding the `user_id` equality filter must not regress duplicate-check latency. With a typical per-user library size, the additional filter should reduce — not increase — the candidate set for stages 2 and 3.
- **NFR-03 (Index usage):** Queries must remain index-friendly. If profiling shows the additional `user_id` filter degrades plan quality on the existing `recipes_source_type_idx` / `recipes_created_at_idx` indices, a composite index involving `user_id` may be added (decision deferred — see Open Questions).
- **NFR-04 (Behavioral parity within own library):** For a user with N recipes in their own collection, the duplicate-detection outcome must be identical to the pre-change behavior on a database containing only those N recipes.
- **NFR-05 (Error handling):** Existing `try/catch` and `{ data, error }` conventions in the import routes remain unchanged. A failure to determine the current user id must surface as an authentication error, not as "no duplicate found".
- **NFR-06 (Test coverage):** The existing Jest test suite (186 tests) must continue to pass. New tests must cover the user-scoping behavior for all three stages.

## 5. User Stories

### US-01 — Two users, same web recipe
**As** an authenticated user
**I want** to import a recipe URL even if another user has already imported the same URL
**So that** I have my own copy in my own library.

**Acceptance Criteria:**
- Given User A has previously imported `https://example.com/pasta` into their library,
- When User B imports the exact same URL,
- Then User B's import succeeds (no duplicate warning is shown),
- And User B's library contains a new recipe row with `user_id = B`.

### US-02 — Same user, same web recipe (regression guard)
**As** an authenticated user
**I want** to be warned if I try to re-import a URL I have already saved
**So that** I do not accidentally create duplicates in my own library.

**Acceptance Criteria:**
- Given User A has imported `https://example.com/pasta`,
- When User A re-submits the same URL (or a tracking-param variant of it),
- Then the early-exit duplicate check returns User A's existing recipe id and title,
- And no Claude API call is made.

### US-03 — Two users, similar recipe titles from photo imports
**As** an authenticated user
**I want** to import a photo of a recipe even if another user has a recipe with a near-identical title
**So that** another user's library cannot block my photo imports.

**Acceptance Criteria:**
- Given User A has a recipe titled "Klassische Tomatensoße",
- When User B imports a photo whose parsed title is "Klassische Tomatensoße",
- Then User B's import is not flagged as a duplicate at stage 3,
- And the recipe is saved into User B's library.

### US-04 — Same user, similar recipe title from photo (regression guard)
**As** an authenticated user
**I want** the fuzzy title check to still protect me from duplicating my own recipes via photo import
**So that** repeated photos of the same dish do not pollute my library.

**Acceptance Criteria:**
- Given User A has a recipe titled "Klassische Tomatensoße",
- When User A imports a photo whose parsed title is "Klassische Tomatensauce" (Jaccard ≥ 0.85 against User A's recipe),
- Then `findDuplicateRecipe` returns User A's existing recipe,
- And the user is shown the existing-recipe warning.

### US-05 — Confirm step honors user scope
**As** an authenticated user
**I want** the final save step to apply the same user-scoped duplicate logic
**So that** there is no inconsistency between import-time and save-time checks.

**Acceptance Criteria:**
- The duplicate check inside `/api/recipes/confirm` uses the authenticated user's id,
- And does not return matches from other users.

## 6. Out of Scope

- **OOS-01** "Copy a shared recipe into my library" shortcut. When User B encounters User A's recipe via a share link and wants their own copy, that flow is a future enhancement (Decision 4B) and is **not** part of this feature.
- **OOS-02** Cross-user duplicate analytics, deduplication suggestions, or admin-level global duplicate views.
- **OOS-03** Data migration of legacy NULL-`user_id` rows. These rows have already been removed manually; no code path in this feature is required to handle them.
- **OOS-04** Changes to URL normalization rules, the Jaccard threshold, the 20-row candidate cap, or the tokenization algorithm.
- **OOS-05** Changes to the `?? null` fallback behavior elsewhere in the codebase.
- **OOS-06** Multi-tenant or family/household shared libraries (a model where multiple users share one duplicate-check namespace).
- **OOS-07** Changes to import rate limiting (20/day/user) or any other unrelated import behavior.

## 7. Open Questions & Decisions Needed

- **OQ-01** Should a composite database index (`user_id`, `source_value`) and/or (`user_id`, `title`) be added to keep stages 1–3 index-friendly under the new filter? — Defer until post-implementation profiling; not blocking.

## 8. Glossary

- **Duplicate check** — The combined three-stage process implemented in `lib/duplicate-check.ts` that decides whether an incoming import matches an existing recipe.
- **Stage 1 (exact match)** — Equality on `recipes.source_value`.
- **Stage 2 (normalized URL match)** — Hostname-scoped candidate fetch followed by URL normalization comparison.
- **Stage 3 (fuzzy title match)** — Longest-distinctive-word candidate fetch followed by Jaccard token-set similarity ≥ 0.85.
- **User scope** — The set of `recipes` rows where `user_id` equals the currently authenticated user's id.
- **Current user id** — The `auth.users.id` value of the user making the import request, as established by Supabase Auth middleware.
- **`source_value`** — The canonical identifier of an import source: full URL, YouTube video id, Instagram shortcode, photo filename, or the literal string `"manual"`.
