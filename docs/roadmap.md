# Rezept-App — Evolution Roadmap

|              |                                                       |
| ------------ | ----------------------------------------------------- |
| Date         | 2026-06-11                                            |
| Basis        | [audit-2026-06.md](./audit-2026-06.md)                |
| Ambition     | Public product launch (per product owner decision)    |
| Direction    | Technical hardening → UX polish → product features    |

Phases are ordered by dependency and risk: hardening first (cheap, removes
launch blockers), then the scalability/UX work a growing user base needs, then
the differentiating product features, then launch logistics.

---

## Phase 1 — Hardening, UX polish, Meal Planning MVP ✅ (this branch)

### Security & correctness
- ✅ Auth + ownership check on `POST /api/recipes/[id]/nutrition` (audit A1)
- ✅ Auth, 10 MB size cap, magic-byte MIME verification on `POST /api/upload-image` (A2); new `lib/image-validation.ts`
- ✅ `profiles` table (synced from `auth.users` via trigger) + `lib/profiles.ts` batch lookups — kills the listUsers 50-user ceiling and all per-row `getUserById` N+1s (A3)
- ✅ `GET /api/settings` race fixed via 23505 → re-select (A6)
- ✅ Timeout on the primary URL-import fetch (A7)
- ✅ Duplicate-check stage queries parallelised, precedence unchanged (A8)
- ✅ One-off `normalize-tags` route removed (A9)

### Infrastructure
- ✅ CI pipeline `.github/workflows/ci.yml`: lint + test + build on every PR and push to master (A4)
- ✅ ESLint `no-explicit-any` → error; existing violations typed (A5)

### UX polish
- ✅ Loading skeleton for the recipe list (was `fallback={null}`)
- ✅ Global `:focus-visible` outline (keyboard navigation visible app-wide)
- ✅ i18n sweep: hardcoded user-facing German strings moved to `messages/{de,en,nl}.json`
- ✅ Step images via `next/image`
- ✅ Toast notifications (`contexts/ToastContext.tsx`, dependency-free) wired to favourite toggle, add-to-shopping-list, copy-to-library

### Product
- ✅ **Meal Planning MVP (Feature 16)** — weekly plan (Mon–Sun ×
  Frühstück/Mittag/Abend), recipe picker, per-entry servings, week →
  shopping list. Spec: [requirements/16-meal-planning.md](./requirements/16-meal-planning.md)

### 🔑 Operator checklist (required after merge)

The dev environment has no DB access; two migrations are authored but **not
applied**. Until applied, the code falls back gracefully (paginated
`auth.admin` lookups; meal plan renders an empty week and rejects writes).

1. Supabase SQL editor → run `supabase/migrations/20260611000000_profiles.sql`
2. Supabase SQL editor → run `supabase/migrations/20260611000001_feature16_meal_plan.sql`
3. Confirm the `[profiles]`/`[meal-plan]` table-missing warnings disappear from logs

---

## Phase 2 — Scale & comfort ✅ (this branch)

Goal: the app feels instant and trustworthy for hundreds of users with
hundreds of recipes each.

1. ✅ **Server-side search + pagination** (A10) — trigram-indexed
   `search_text` column (substring semantics identical to the old client
   filter, incl. ingredient names), stored `total_time` for SQL time-sort.
   The main page SSRs the first 24 matches per URL params; `RecipeList`
   keeps its URL-param UX and appends pages via `GET /api/recipes/search`.
   Share pages keep the client mode. Title-only fallback until the
   migration is applied.
2. ✅ **Shopping list cloud sync** (A13) — `shopping_list_items` table
   (composite PK user_id+id, owner RLS, tombstones), per-item LWW merge in
   `POST /api/shopping-list/sync`, debounced push + pull-on-mount via
   `useShoppingListSync` (UserNav, list page, ShoppingMode). localStorage
   stays the offline source of truth.
3. ✅ **Dark mode** (A12) — `darkMode: 'class'` over RGB-triplet CSS
   variables, pre-paint theme script, System/Hell/Dunkel toggle in settings.
4. ✅ **Error monitoring** (A14) — `@sentry/nextjs` (server/edge/client +
   global-error), complete no-op without `NEXT_PUBLIC_SENTRY_DSN`.
   *Operator: create a Sentry project and set the env vars in Vercel.*
5. ✅ **Admin + sharing UI i18n** (A17) — `components/admin/*`,
   `ShareManager`, `LibraryShareManager`, `IncomingSharesManager` moved to
   next-intl (de/en/nl).
6. ✅ **E2E depth** (A15) — suite repaired (locale pinned to de-DE, stale
   assertions fixed) and extended with offline-page and locale-routing
   specs (12 specs green). Import/cook flows need a real test Supabase
   project — tracked in docs/test-concept.md §14 (Phase 4).

### 🔑 Operator checklist (after merge, in addition to Phase 1)

3. Supabase SQL editor → run `supabase/migrations/20260611000002_recipe_search.sql`
4. Supabase SQL editor → run `supabase/migrations/20260611000003_shopping_list_sync.sql`
5. Optional: create a Sentry project and set `NEXT_PUBLIC_SENTRY_DSN`
   (+ `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source maps) in Vercel

## Phase 3 — Product differentiation ✅ (this branch)

1. ✅ **AI cooking assistant** (Feature 18) — three new call sites via the shared
   `claudeCreate` wrapper; 30 calls/user/day over `claude_api_calls`:
   - „Was kann ich kochen?": match free-text pantry input against the user's
     library (title + ingredients), rank and explain suggestions.
   - Weekly plan suggestions: generate a draft week (respecting recipe_type
     mix and recently cooked) that pre-fills `meal_plan_entries`.
   - Cooking Q&A in cook mode (short contextual answers about the current
     step/ingredients).
   Reuses the per-portion data model; budget via the existing
   `claude_api_calls` logging; respects the daily import-style rate limits.
   Effort: L.
2. ✅ **Discovery & collections** (Feature 17) — user-defined collections (folders),
   ratings + personal notes per recipe, „gekocht"-counter (feeds the
   assistant's suggestions), seasonal/tag-based highlights on the list page.
   Effort: M–L.
3. ✅ **Unified library search across shares** — shipped early as part of the
   Phase-2 server search (`lib/recipe-search.ts` visibility OR-filter).

### 🔑 Operator checklist (after merge, in addition to Phases 1–2)

6. Supabase SQL editor → run `supabase/migrations/20260611000004_feature17_discovery.sql`
   (ratings/notes/cooked columns + collections — until then: rating/notes UI
   errors are caught, cooked counter is a no-op, collections report 503)

## Phase 3.5 — Nutrition tracking (Feature 19) ✅ Phases 1–3

Yazio-style **food diary + personalized calorie/macro goals**. New `/nutrition`
daily dashboard: a body-profile form computes a daily kcal + macro budget
(Mifflin-St Jeor → activity-adjusted TDEE → goal adjustment, pure
`lib/nutrition-goals.ts`); the user logs food per meal slot by picking a library
recipe (per-serving nutrition snapshotted) or via manual quick-entry, and sees
consumed-vs-remaining as a custom SVG calorie ring + macro bars. Two tables
(`nutrition_profiles`, `food_log_entries`), `/api/nutrition/*` routes, full
de/en/nl i18n. Spec: [requirements/19-nutrition-tracking.md](./requirements/19-nutrition-tracking.md).
**Phase 2 (shipped, no migration):** a "Foto" tab in the add-food dialog sends a
dish photo to `POST /api/nutrition/estimate-photo` → Claude Vision
(`estimateNutritionFromPhoto`) estimates kcal/macros → prefills the manual form for
review → saved with `source='photo'`. Capped at 15/user/day
(`lib/nutrition-photo-rate-limit.ts`); the photo is not persisted.
**Phase 3 (shipped):** an intermittent-fasting tracker at `/fasting` — start a fast
(presets 16:8/18:6/20:4/OMAD or custom hours), a live SVG countdown ring
(`lib/fasting.ts` + `FastingTimer`), stop, and a history list. New table
`fasting_sessions` (partial unique index = one open fast/user), `/api/nutrition/fasting`
routes. No Wake Lock for multi-hour fasts.

### 🔑 Operator checklist (after merge, in addition to Phases 1–3)

7. Supabase SQL editor → run
   `supabase/migrations/20260615000000_feature19_nutrition_tracking.sql`
   (until then: `/nutrition` shows the onboarding/empty state, profile GET
   returns null, and diary writes report 503 — all graceful).
8. Supabase SQL editor → run
   `supabase/migrations/20260615000001_feature19_fasting.sql`
   (until then: `/fasting` shows an empty state and starting a fast reports 503).

## Phase 4 — Launch readiness

1. **Google OAuth go-live** — code-complete; follow
   [requirements/google-auth-golive.md](./requirements/google-auth-golive.md)
   (Google Cloud console + Supabase provider + Vercel env). Effort: S.
2. **Web Push go-live** — generate VAPID keys, set env vars, apply
   `push_subscriptions` migration; see
   [requirements/push-notifications-golive.md](./requirements/push-notifications-golive.md). Effort: S.
3. **Store packaging** — TWA (Play Store) first, Capacitor evaluation for iOS;
   enablers already shipped, see
   [requirements/store-packaging-golive.md](./requirements/store-packaging-golive.md). Effort: L.
4. **Claude cost control** — revisit prompt caching once prompts can reach the
   2048-token prefix minimum ([requirements/12-claude-prompt-caching.md](./requirements/12-claude-prompt-caching.md));
   per-user monthly token budget enforced server-side with admin override;
   surface spend in the admin dashboard (logging exists). Effort: M.
5. **Open registration** — flip `INVITE_ONLY_REGISTRATION=false`, add abuse
   guards first: per-IP signup throttle, email verification required (already
   on), import rate limit per user (exists, 20/day). Effort: S.

---

*Maintained alongside [requirements/README.md](./requirements/README.md). Update
phase status when items ship.*
