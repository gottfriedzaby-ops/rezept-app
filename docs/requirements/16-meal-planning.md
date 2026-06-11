# Feature 16 — Meal Planning (Wochenplan)

|               |                                                                        |
| ------------- | ---------------------------------------------------------------------- |
| ID            | 16                                                                     |
| Status        | ✅ MVP shipped (2026-06-11)                                            |
| Priority      | High                                                                   |
| Effort        | M                                                                      |
| Components    | `app/[locale]/meal-plan/`, `app/api/meal-plan/`, `components/MealPlanWeek.tsx`, `components/MealPlanRecipePicker.tsx`, `lib/meal-plan.ts`, `types/meal-plan.ts` |
| Schema change | Yes — `supabase/migrations/20260611000001_feature16_meal_plan.sql`     |
| Dependencies  | Feature 05 (Auth), Feature 07 (Shopping List)                          |

## Overview

Users plan which recipes they cook on which day of the week. A week view
(Monday–Sunday) with three meal slots per day (Frühstück / Mittag / Abend)
lets them assign recipes from their own library, adjust the serving count per
entry, and push the entire week's ingredients onto the existing shopping list
in one tap.

## User Stories

1. *„Ich möchte meine Woche vorplanen, damit ich nur einmal einkaufen muss."*
   — A user adds recipes to days/slots and taps **„Woche zur Einkaufsliste"**;
   all ingredients land scaled on the shopping list.
   - ✅ Every entry of the visible week is added with its effective serving
     count (entry override, else recipe default, else 1).
2. *„Wir sind am Mittwoch zu sechst, sonst zu zweit."* — Per-entry serving
   override via stepper (1–20), without touching the recipe itself.
3. *„Was koche ich nächste Woche?"* — Week navigation (←/→, „Diese Woche").
   The week is part of the URL (`?week=YYYY-MM-DD`), so plans are linkable.

## Functional Requirements

- **FR-16-1** Week view Mon–Sun × 3 slots; the current day is highlighted.
- **FR-16-2** Add entry: recipe picker (searchable by title) per day+slot;
  only the user's **own** recipes are plannable (MVP).
- **FR-16-3** Multiple recipes per slot allowed; the same recipe twice in the
  same slot on the same day is rejected (409, German error).
- **FR-16-4** Per-entry servings override, integer 1–20; `NULL` means recipe
  default.
- **FR-16-5** Remove entry (no confirmation — re-adding is cheap).
- **FR-16-6** „Woche zur Einkaufsliste": flattens all section ingredients per
  recipe and calls the existing `addRecipeItems` (per-portion scaling), then
  `notifyListChanged()` + toast with the item count.
- **FR-16-7** Entries link to the recipe detail page.
- **FR-16-8** `?week=` accepts any ISO date and snaps to that week's Monday;
  invalid values fall back to the current week.

## Non-Functional Requirements

- API follows the `{ data, error }` envelope, German error texts, 401 when
  unauthenticated, ownership checked explicitly (service-role client).
- RLS: owner-only policy on `meal_plan_entries` (defense in depth behind the
  API ownership checks).
- Pre-migration resilience: until the operator applies the migration, the
  page renders an empty week (42P01 handled) instead of crashing.
- All UI strings via next-intl (de/en/nl); dates formatted per locale.

## Data Model

```sql
meal_plan_entries (
  id uuid PK,
  created_at timestamptz,
  user_id uuid → auth.users ON DELETE CASCADE,
  recipe_id uuid → recipes ON DELETE CASCADE,
  date date,
  meal_slot text CHECK IN ('fruehstueck','mittag','abend'),
  servings int CHECK 1–20 NULL,
  UNIQUE (user_id, date, meal_slot, recipe_id)
)
```

## API

| Route | Method | Behaviour |
|---|---|---|
| `/api/meal-plan?week=` | GET | Entries of the week (Mon + 7 days), recipe columns joined |
| `/api/meal-plan` | POST | Validate date/slot/servings; 404 unknown recipe, 403 foreign recipe, 409 duplicate, 201 created |
| `/api/meal-plan/[id]` | PATCH | Update servings (1–20 or null), scoped to owner, 404 otherwise |
| `/api/meal-plan/[id]` | DELETE | Delete entry, scoped to owner, 404 otherwise |

## Out of Scope (follow-ups, see docs/roadmap.md)

- Planning recipes from accepted library shares (Phase 2/3)
- AI-generated week suggestions feeding `meal_plan_entries` (Phase 3)
- Server-synced shopping list interplay (Phase 2)

## Tests

- `__tests__/lib/meal-plan.test.ts` — week math (UTC, year boundaries, Sunday)
- `__tests__/api/meal-plan.test.ts` — auth, validation, ownership, 409/404
- `__tests__/components/MealPlanWeek.test.tsx` — rendering, add flow,
  week-to-shopping-list (localStorage + toast)
