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

## Phase 2 — Scale & comfort (next)

Goal: the app feels instant and trustworthy for hundreds of users with
hundreds of recipes each.

1. **Server-side search + pagination** (A10) — use the existing
   `search_vector` tsvector + GIN index: `GET /api/recipes?q=&cursor=` with
   `textSearch("search_vector", q, { type: "websearch", config: "german" })`,
   cursor on `created_at`. Keep `RecipeList`'s URL-param UX; switch the data
   source behind it. Tag/favourite filters become query params evaluated in
   SQL. Effort: M.
2. **Shopping list cloud sync** (A13) — `shopping_lists` +
   `shopping_list_items` tables (owner RLS), localStorage becomes the offline
   cache; merge strategy last-write-wins per item on reconnect. Preserve the
   `lib/shopping-list.ts` API surface so `ShoppingMode`/`AddToShoppingListButton`
   don't change. Unlocks household sharing later. Effort: M–L.
3. **Dark mode** (A12) — `darkMode: 'class'`, dark values for the existing
   CSS custom properties, toggle in settings persisted in `user_settings`.
   Effort: S–M.
4. **Error monitoring** (A14) — `@sentry/nextjs` (server + client), release
   tagging on Vercel deploys, alert rule for API 5xx spikes. Effort: S.
5. **Admin UI i18n** (A17) — move `components/admin/*` strings to next-intl.
   Effort: S.
6. **E2E depth** (A15) — Playwright flows for import→review→confirm (mocked
   Claude), cook mode, meal plan → shopping list. Effort: M.

## Phase 3 — Product differentiation

1. **AI cooking assistant** — new `lib/claude.ts` call sites:
   - „Was kann ich kochen?": match free-text pantry input against the user's
     library (title + ingredients), rank and explain suggestions.
   - Weekly plan suggestions: generate a draft week (respecting recipe_type
     mix and recently cooked) that pre-fills `meal_plan_entries`.
   - Cooking Q&A in cook mode (short contextual answers about the current
     step/ingredients).
   Reuses the per-portion data model; budget via the existing
   `claude_api_calls` logging; respects the daily import-style rate limits.
   Effort: L.
2. **Discovery & collections** — user-defined collections (folders),
   ratings + personal notes per recipe, „gekocht"-counter (feeds the
   assistant's suggestions), seasonal/tag-based highlights on the list page.
   Effort: M–L.
3. **Unified library search across shares** — extend Phase-2 server search to
   accepted library shares (Feature 11 follow-up). Effort: S–M.

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
