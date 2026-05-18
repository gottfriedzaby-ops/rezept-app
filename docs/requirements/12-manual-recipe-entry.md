# Feature 12 — Manual Recipe Entry

**Rezept manuell anlegen — ohne externe Quelle**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **S** (1–3 days) |
| Priority | Medium |
| Dependencies | FR-08 (import failure error pages — shares the "open empty review form" entry path) |

---

## 1. Overview

The app currently supports five import sources (URL, YouTube, photo, Instagram, PDF) and a `manual` source type at the data-model level, but no first-class UI entry point exists for the user to actually create a recipe by hand. Family recipes, recipes the user invented themselves, and notebook recipes that no other import path can capture are second-class citizens today.

This feature adds an explicit **"Manuell anlegen"** entry point to the home screen and wires it to the existing review form rendered empty. On save, the recipe is persisted with `source_type = 'manual'` and `source_value = 'manual'`, satisfying BR-02 of `requirements.md` without forcing the user to fabricate provenance text.

**Goal:** make manual entry a fully supported, equally discoverable import path — not a hidden fallback.

---

## 2. Business Requirements

| ID | Requirement |
|----|-------------|
| BR-12-1 | Manual recipe entry must be discoverable from the home screen at the same level as the import options (URL / YouTube / photo / PDF). |
| BR-12-2 | Manual entries must satisfy the universal source rule (BR-02 of `requirements.md`) without burdening the user — `source_value = 'manual'` is acceptable provenance. |
| BR-12-3 | Manual entry must reuse the same review form used after a successful import, so users learn one UI. |

---

## 3. User Stories

### US-12-1 — Add a family recipe from scratch
> Als Nutzer möchte ich ein Rezept manuell anlegen können, ohne eine externe Quelle, weil es ein Familienrezept ist oder ich es selbst erfunden habe.

**Acceptance criteria:**
- A "Manuell anlegen" entry point exists on the home screen, presented at the same visual level as the import options.
- Clicking it opens an empty review form (the same component used after a successful import).
- After saving, the recipe appears in the user's library with `source_type = 'manual'` and `source_value = 'manual'`.

---

### US-12-2 — Fall back to manual entry after a failed import
> Als Nutzer möchte ich vom Fehlerbildschirm eines fehlgeschlagenen Imports direkt zur manuellen Eingabe wechseln können, damit ich nicht von vorn anfangen muss.

**Acceptance criteria:**
- The import-failure page (per FR-08 of `requirements.md`) exposes a "Manuell anlegen" CTA.
- Clicking it lands the user on the same empty review form as US-12-1.
- The form is genuinely empty (no half-parsed data from the failed import is carried over, to avoid presenting unreliable parse output as "ground truth").

---

### US-12-3 — Enforce minimum-viable recipe content
> Als Nutzer möchte ich daran gehindert werden, ein leeres oder nutzloses Rezept zu speichern, damit meine Bibliothek nicht von unbrauchbaren Einträgen verschmutzt wird.

**Acceptance criteria:**
- The form blocks saving when the title is missing, no ingredient row exists, or no step exists.
- Inline German validation messages explain what is missing.

---

## 4. Functional Requirements

### FR-12-1 — Home-screen entry point
The home screen MUST render a "Manuell anlegen" button alongside the existing import entry points (URL / YouTube / Foto / PDF). The button MUST be visually equivalent (not smaller, not visually demoted) — manual entry is a first-class import path.

### FR-12-2 — Empty review form
Clicking "Manuell anlegen" MUST open the existing review form component used after a successful import, with all fields blank:
- Title: empty
- Servings: blank (placeholder shown; user must enter)
- Prep time / cook time: blank
- Ingredients: one empty row, with an "Add ingredient" button
- Steps: one empty step, with an "Add step" button
- Tags: empty
- Cover image: empty (upload optional)
- Recipe type selector: default `kochen` (consistent with import flows)
- Sections: optional, can be added by the user (per `03-multi-section-recipes.md`)

### FR-12-3 — Source metadata
On save, the system MUST persist:
- `source_type = 'manual'`
- `source_value = 'manual'`
- `source_title` = `null` (or omitted)

These values MUST be set automatically; the user MUST NOT be required to type a custom source string. This matches the FR-01 contract in `requirements.md`.

### FR-12-4 — Required fields
Save MUST be blocked unless:
- `title` is non-empty (trimmed)
- At least 1 ingredient row exists with a non-empty `name`
- At least 1 step exists with non-empty `text`

Each failure MUST render an inline German validation message ("Titel ist erforderlich", "Mindestens eine Zutat angeben", "Mindestens ein Schritt angeben").

### FR-12-5 — Optional fields
The following fields MUST be optional and saveable as `null` / empty:
- `description`
- `servings` (defaults to `1` if not provided, so per-serving arithmetic stays well-defined)
- `prep_time`, `cook_time`
- `tags`
- `image_url`
- `step_images`, `timerSeconds` per step

### FR-12-6 — Reuse the confirm pipeline
On save, the form MUST POST to the existing `/api/recipes/confirm` route. The confirm route MUST handle `source_type = 'manual'` without invoking any external parsing or fetching:
- No Claude parse pass.
- No Claude review pass.
- `estimateNutrition` MAY still be invoked (best-effort, same as other imports) per `08-nutrition-calculation.md`.
- Duplicate check MUST be run with stages 1 and 2 skipped (analogous to PDF, FR-10-60), since `source_value = 'manual'` would otherwise collide for every manual entry. Stage 3 (fuzzy title Jaccard) MUST still run.

### FR-12-7 — Rate-limit accounting
A successful manual save MUST count against the user's daily 20-import cap (FR-133 of `requirements.md`). This keeps the cap meaningful and prevents the manual path from being used as a quota-evasion workaround. The cap check happens at `/api/recipes/confirm` per the existing pattern.

### FR-12-8 — Cover image (optional)
The user MAY upload a cover image during manual entry. If provided, it follows the existing upload path (Supabase Storage, NFR-07). Manual entry MUST work with no cover; the recipe list falls back to the tag-based pastel gradient (FR-72).

---

## 5. Non-Functional Requirements

### NFR-12-1 — German UI
All labels, placeholders, validation messages, and error states MUST be in German (NFR-01 of `requirements.md`).

### NFR-12-2 — Identical layout to import review form
The form MUST be the same component used by all import flows. Divergence (e.g. a separate "manual entry" component) is explicitly rejected to keep maintenance cost down and the UX consistent.

### NFR-12-3 — Accessibility
The home-screen "Manuell anlegen" button MUST be keyboard-focusable and have an `aria-label` that announces "Rezept manuell anlegen".

---

## 6. Out of Scope (v1)

- **OOS-12-1** Importing a recipe by typing a structured paste (e.g. "paste raw recipe text and let Claude parse it"). That is a separate import pipeline, not manual entry.
- **OOS-12-2** A dedicated mobile-optimised wizard with step-by-step "next" navigation. The shared review form is used as-is.
- **OOS-12-3** Templates (e.g. "blank cake recipe template", "blank pasta recipe template"). A truly blank form is the v1 deliverable.
- **OOS-12-4** Pre-filling the user's most-used tags or recipe type. The form starts empty / at sensible defaults only.

---

## 7. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-12-1 | Should `source_value` for manual entries store a free-text "Quelle" (e.g. "Oma's Kochbuch") when the user wants to attribute it? | UX | Product |
| OQ-12-2 | If OQ-12-1 lands as "yes", how does the duplicate-check stage-1 behaviour change for the freely-typed strings? | Architecture | Engineering |
| OQ-12-3 | Should manual entries skip the duplicate-check warning entirely, or still alert on fuzzy title match? | UX | Product |

---

## 8. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| D1 | Where does the entry point live? | **Home screen, alongside the import options** | Discoverability is the entire point of this feature. |
| D2 | Reuse the review form or build a separate UI? | **Reuse** | One UI, one mental model, one place to maintain. |
| D3 | Required fields | **Title + ≥1 ingredient + ≥1 step** | Below this floor the entry is not a usable recipe. |
| D4 | Default `servings` if user leaves it blank | **1** | Keeps per-serving arithmetic well-defined throughout the app. |
| D5 | Does manual entry count against the 20/day cap? | **Yes** | Prevents the manual path from being a quota workaround. |
| D6 | Duplicate-check behaviour | **Skip stages 1+2 (URL-based), run stage 3 (fuzzy title)** | Same reasoning as PDF imports — `source_value = 'manual'` is not a useful identifier. |

---

## 9. Acceptance Criteria (summary)

A manual recipe entry is considered acceptance-complete when:

1. The "Manuell anlegen" button is visible on the home screen at the same visual level as the import buttons.
2. Clicking it opens the empty review form.
3. The user can fill in title + ≥1 ingredient + ≥1 step and successfully save.
4. The saved recipe appears in the library with `source_type = 'manual'`, `source_value = 'manual'`.
5. Attempting to save with missing required fields surfaces inline German validation errors and blocks the save.
6. The save counts as 1 against the daily import cap.
7. The fuzzy-title duplicate warning still appears when applicable.
8. From a failed import error page (FR-08), the "Manuell anlegen" CTA lands the user on the same empty form.
