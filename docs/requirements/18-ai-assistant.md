# Feature 18 — AI Cooking Assistant

|               |                                                                        |
| ------------- | ---------------------------------------------------------------------- |
| ID            | 18                                                                     |
| Status        | ✅ Shipped (2026-06-11)                                                |
| Priority      | High                                                                   |
| Effort        | L                                                                      |
| Components    | `lib/assistant.ts`, `lib/assistant-rate-limit.ts`, `app/api/assistant/`, `app/[locale]/assistant/`, `components/AssistantSuggest.tsx`, `components/CookAssistant.tsx`, `components/MealPlanWeek.tsx` |
| Schema change | No (logs via existing `claude_api_calls`)                              |
| Dependencies  | Feature 16 (Wochenplan), Feature 17 (cooked counter feeds variety)     |

## Overview

Three assistant capabilities built on the user's **own library** (no external
recipes), all running through the shared `claudeCreate` wrapper in
`lib/claude.ts` so every call is token-logged into `claude_api_calls`:

1. **„Was kann ich kochen?"** (`/assistant`) — free-text pantry input →
   max 5 ranked suggestions with a one-line reason and missing ingredients
   (addable to the shopping list). Model: `claude-sonnet-4-6`.
2. **Wochenplan-Vorschlag** — fills the visible week's empty *Abend* slots
   with varied recipes (avoids the past 2 weeks of planned/cooked recipes);
   preview modal → applied via the regular `POST /api/meal-plan`.
   Model: `claude-sonnet-4-6`.
3. **Koch-Fragen** in CookMode — short contextual answers (≤ 4 German
   sentences) about the current recipe/step. Model: `claude-haiku-4-5`.

## Guardrails

- **Rate limit:** 30 assistant calls/user/day (UTC), counted over
  `claude_api_calls` (`lib/assistant-rate-limit.ts`); HTTP 429 with German
  text. Fails open if the tracking table is unreadable.
- **Hallucination defence:** all returned `recipe_id`s are validated against
  the set sent in the prompt; week-plan slots are validated against the open
  slots; duplicates dropped; caps enforced (5 suggestions, 1 recipe/slot,
  recipe unique per week).
- **Prompt budget:** max 300 recipes per prompt (newest first), max 15
  ingredient names per recipe, pantry text ≤ 1000 chars, questions ≤ 500.
- **Privacy:** only the user's own recipes are sent; answers never leave the
  request/response cycle (no chat history stored).
- Claude outages → HTTP 502 with a German retry message; the app keeps
  working without the assistant.

## Functional Requirements

- **FR-18-1** `/assistant` page with pantry textarea, loading skeleton,
  empty/error states; suggestion cards link to recipes; „Fehlende zur
  Einkaufsliste" adds missing items as unscaled entries.
- **FR-18-2** „Woche vorschlagen" on `/meal-plan` proposes entries only for
  empty Abend slots of the visible week; user confirms before anything is
  written.
- **FR-18-3** CookMode Q&A is collapsed by default and never blocks cooking
  interactions; answers reference the current step.
- **FR-18-4** All three endpoints: 401 unauthenticated, 429 over limit,
  400 validation, German errors, `{ data, error }` envelope.

## Tests

`__tests__/lib/assistant.test.ts` (validation/dedup/caps + model choice),
`__tests__/api/assistant.test.ts` (auth, rate limit, open-slot computation,
ownership), CookMode/MealPlanWeek suites cover the mounts.
