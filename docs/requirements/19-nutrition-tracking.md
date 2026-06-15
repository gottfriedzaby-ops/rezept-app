# Feature 19 — Nutrition Tracking (Ernährungstagebuch + Ziele)

|               |                                                                        |
| ------------- | ---------------------------------------------------------------------- |
| ID            | 19                                                                     |
| Status        | ✅ Phase 1 + 2 shipped (2026-06-15)                                    |
| Priority      | High                                                                   |
| Effort        | L                                                                      |
| Components    | `app/[locale]/nutrition/`, `app/api/nutrition/`, `components/nutrition/*`, `lib/nutrition-goals.ts`, `types/nutrition.ts` |
| Schema change | Yes — `supabase/migrations/20260615000000_feature19_nutrition_tracking.sql` |
| Dependencies  | Feature 05 (Auth), Feature 08 (Nutrition per recipe), Feature 16 (Meal-plan patterns) |

## Overview

Bring Yazio's core idea into the app: a **food diary** with a **personalized
daily calorie/macro budget**. The user sets up a body profile once (sex, birth
date, height, weight, activity, goal); from that we compute a daily kcal +
protein/carbs/fat target (Mifflin-St Jeor → activity-adjusted TDEE → goal
adjustment). They then log what they eat per meal slot — by picking a recipe
from their library (its per-serving nutrition is reused) or via a quick manual
entry — and see consumed vs remaining as a calorie ring and macro bars.

This is **Phase 1**. Photo-based estimation (Phase 2) and intermittent fasting
(Phase 3) are outlined below but not built.

## User Stories

1. *„Wie viele Kalorien darf ich heute essen?"* — The user fills in the goal
   form and immediately sees their computed daily budget.
2. *„Ich habe gerade dieses Rezept gegessen."* — Pick a library recipe in a
   meal slot; its per-serving nutrition is snapshotted into the diary.
3. *„Ich hatte einen Apfel."* — Add a manual entry (name + kcal + macros) that
   isn't a saved recipe.
4. *„Wie viel habe ich heute schon gegessen?"* — The dashboard shows consumed,
   remaining and a per-macro breakdown for the selected day.

## Functional Requirements

- **FR-19-1** Body profile (`sex`, `birth_date`, `height_cm`, `weight_kg`,
  `activity_level`, `goal`), one row per user; editable any time.
- **FR-19-2** Daily targets auto-computed from the profile (Mifflin-St Jeor;
  activity multipliers 1.2–1.9; goal −500/0/+400 kcal; safety floor 1200/1500
  kcal). A `manual_targets` flag lets the user override the computed values.
- **FR-19-3** Macro split defaults to carbs 50% / fat 30% / protein 20% of kcal.
- **FR-19-4** Diary entry per `date` + `meal_slot`
  (`fruehstueck`/`mittag`/`abend`/`snacks`), from a recipe or a manual food.
- **FR-19-5** Entries store a **per-serving nutrition snapshot** + a `servings`
  multiplier; the entry total is `kcal_per_serving × servings`. History is
  stable if the source recipe is later changed or deleted (`recipe_id` is
  `ON DELETE SET NULL`).
- **FR-19-6** Logging a recipe with no nutrition yet is rejected (422,
  `NUTRITION_MISSING`); the user calculates it first via the existing
  `POST /api/recipes/[id]/nutrition`.
- **FR-19-7** Daily totals + remaining computed server-side (sum of the day's
  entries), returned by `GET /api/nutrition/log?date=`.
- **FR-19-8** Per-entry servings stepper and delete; day navigation
  (`?date=YYYY-MM-DD`, default = today in UTC).
- **FR-19-9** A health disclaimer is shown (estimates, not medical advice).

## Non-Functional Requirements

- Ownership enforced explicitly (`user_id = auth.uid()` in RLS **and** every
  API query) — body data never leaves the owner.
- Graceful degradation: until the migration is applied, read paths return an
  empty diary / `data:null` (42P01 → 200/503 with German messages), the page
  does not crash.
- i18n in all three locales (de/en/nl) under the `Nutrition` namespace.
- Daily date boundary is UTC (consistent with the rate-limit helpers).

## Data Model Impact

Two new tables (see migration):

- **`nutrition_profiles`** — `user_id` PK, body fields, computed `target_*`
  columns, `manual_targets`, `created_at`/`updated_at` (trigger). Owner RLS.
- **`food_log_entries`** — `id`, `user_id`, nullable `recipe_id`
  (`ON DELETE SET NULL`), `date`, `meal_slot`, `source`
  (`recipe`/`manual`/`photo`), `label`, `servings`, and the per-serving
  snapshot `kcal_per_serving`/`protein_g`/`carbs_g`/`fat_g`. Indexes on
  `(user_id, date)` and `(recipe_id)`. Owner RLS.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/nutrition/profile` | profile or `null` |
| PUT | `/api/nutrition/profile` | upsert; recompute targets unless `manual_targets` |
| GET | `/api/nutrition/log?date=` | entries + totals + target + remaining |
| POST | `/api/nutrition/log` | add entry (recipe snapshot or manual) |
| PATCH | `/api/nutrition/log/[id]` | edit servings/slot/macros |
| DELETE | `/api/nutrition/log/[id]` | remove entry |

## Phase 2 — Photo nutrition estimation ✅ shipped (2026-06-15)

`POST /api/nutrition/estimate-photo` (no migration): validates the upload via
`lib/image-validation.ts` magic-byte sniffing (+ 10 MB cap, HEIC→JPEG via
`heic-convert`), then calls Claude Vision (`claude-sonnet-4-6`,
`estimateNutritionFromPhoto` in `lib/claude.ts`) to return
`{label, kcal_per_serving, protein_g, carbs_g, fat_g}`. Logged via `claudeCreate`
(admin metrics) and capped at **15/user/day** (`lib/nutrition-photo-rate-limit.ts`,
German 429). The photo is **not persisted** — only the estimate is returned. A
"Foto" tab in `AddFoodDialog` analyses the image, then prefills the manual form for
review; the confirmed entry is stored with `source='photo'` (already in the CHECK
constraint). Estimates are clearly labelled as such.

## Phase 3 — Intermittent fasting (planned)

`fasting_sessions` table (`started_at`, nullable `ended_at`, `target_hours`,
`preset`; partial unique index `WHERE ended_at IS NULL` = one open session per
user). Start/stop/history API + a live timer UI with presets (16:8 …).

## Open Questions

- Per-user timezone for the diary day boundary (Phase 1 uses UTC).
- Optional weight history + progress chart (deliberately out of scope here).

## Effort Estimate

**L** — two tables, pure goal math, four API routes, a dashboard with custom SVG
visualizations, full i18n, and test coverage. Phases 2–3 are separate increments.
