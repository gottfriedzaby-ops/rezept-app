# Feature 03 — Multi-Section Recipe Structure

**Rezeptabschnitte: "Für die Soße" + "Für den Teig"**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **M** (3–8 days) |
| Priority | Medium |
| Dependencies | None (but affects Feature 07 — Shopping List) |

---

## 1. Overview

Many real-world recipes are internally structured into named sections. A lasagne recipe might have "Für die Béchamelsauce", "Für die Fleischsoße", and "Für den Aufbau" — each with its own ingredients and steps. The current flat `ingredients` and `steps` JSONB arrays cannot represent this structure without losing the section grouping.

Without this feature, Claude either:
- Merges all ingredients into one flat list (losing which ingredients belong to which component), or
- Adds section headers as fake step entries (hacky, breaks cook mode timers).

This feature introduces a proper `sections` concept: each recipe can have one or more named sections, each with its own ingredient and step arrays.

**Goal:** Import, display, edit, and cook multi-component recipes while remaining fully backward compatible with existing flat recipes.

---

## 2. User Stories

### US-03-1 — Imported recipe shows distinct sections
> Als Nutzer möchte ich, dass ein importiertes Rezept, das aus mehreren Komponenten besteht (z.B. "Für die Soße" und "Für die Nudeln"), diese Abschnitte mit eigenen Zutaten und Schritten getrennt anzeigt, damit ich beim Kochen den Überblick behalte.

**Acceptance criteria:**
- Recipe detail page shows each section as a visually separated block with its own heading.
- Ingredients and steps within each section are grouped under their section heading.

---

### US-03-2 — Cook mode respects sections as chapter headers
> Als Nutzer möchte ich im Kochmodus sehen, welchem Abschnitt ein Schritt gehört, damit ich weiß, ob ich gerade an der Soße oder am Teig arbeite.

**Acceptance criteria:**
- Cook mode displays section titles as chapter headings between steps.
- Steps from different sections do not intermix without a visual divider.

---

### US-03-3 — Flat recipes continue to render as before
> Als Nutzer möchte ich, dass meine bestehenden Rezepte ohne Abschnitte genauso aussehen wie bisher, damit die Änderung keine visuellen Brüche verursacht.

**Acceptance criteria:**
- Existing recipes with flat `ingredients`/`steps` arrays and no `sections` data render identically to before.
- No visual "section 1" header appears for flat recipes.

---

### US-03-4 — Edit form supports adding, renaming, and removing sections
> Als Nutzer möchte ich im Bearbeitungsmodus Abschnitte hinzufügen, umbenennen und entfernen können, damit ich das importierte Rezept bei Bedarf korrigieren oder strukturieren kann.

**Acceptance criteria:**
- Edit form shows section tabs or accordion panels.
- Each section panel has: editable section title, ingredient list editor, steps editor.
- "Abschnitt hinzufügen" button adds a new unnamed section.
- "Abschnitt entfernen" button (with confirmation) deletes a section and its contents.
- Sections can be reordered.

---

## 3. Functional Requirements

### FR-03-1 — Claude parser extracts sections
The Claude recipe parsing prompt MUST request sections in its JSON output when they are detected:

```json
{
  "sections": [
    {
      "title": "Für die Soße",
      "ingredients": [{ "amount": 400, "unit": "g", "name": "Tomaten" }],
      "steps": [{ "order": 1, "text": "Tomaten pürieren.", "timerSeconds": null }]
    },
    {
      "title": "Für den Teig",
      "ingredients": [{ "amount": 300, "unit": "g", "name": "Mehl" }],
      "steps": [{ "order": 1, "text": "Mehl sieben.", "timerSeconds": null }]
    }
  ]
}
```

If the recipe has no distinct sections, Claude MUST return a single section with `title: null` (or an empty string). This represents the existing flat structure.

### FR-03-2 — Backward-compatible single-section fallback
If `sections` contains exactly one entry with `title: null` or `title: ""`, the recipe display MUST render without any section heading — matching the existing flat recipe appearance.

### FR-03-3 — Recipe detail page — section display
When `sections` has 2 or more entries, or 1 entry with a non-empty title, the detail page MUST:
- Render a section heading (e.g. `<h3>Für die Soße</h3>`).
- Render the section's ingredients list below the heading.
- Render the section's steps list below the ingredients.
- Visually separate sections (e.g. a horizontal rule or spacing).

### FR-03-4 — Cook mode — section chapter headers
In cook mode (step-by-step view), when transitioning to the first step of a new section, the UI MUST display a chapter header with the section title. Steps within the same section MUST NOT repeat the header.

### FR-03-5 — Edit form — section management
The edit form MUST support:
- Displaying each section in a separate panel (tab, accordion, or sequential card).
- Editing section titles inline.
- Adding a new section via an "Abschnitt hinzufügen" button.
- Deleting a section via a "Abschnitt entfernen" button with a confirmation dialog ("Bist du sicher? Alle Zutaten und Schritte dieses Abschnitts werden gelöscht.").
- Reordering sections via drag-and-drop or up/down arrow buttons.

### FR-03-6 — Shopping list compatibility (Feature 07)
When Feature 07 (Shopping List) is implemented, it MUST support adding ingredients from a specific section or all sections. If Feature 03 is deployed before Feature 07, ensure the shopping list feature accounts for the sections structure.

### FR-03-7 — Search unaffected
The `search_vector` generated column uses `title`, `description`, and `tags`. Multi-section ingredient names inside JSONB are not indexed by the current full-text search. This remains unchanged — no requirement to index section content for search in v1.

---

## 4. Non-Functional Requirements

### NFR-03-1 — Backward compatibility
The existing `ingredients` (JSONB) and `steps` (JSONB) columns MUST remain in the schema. All existing API routes and components that read from these columns MUST continue to work for flat recipes. No breaking changes to the existing data shape.

### NFR-03-2 — TypeScript strict types
New types MUST be added:
```ts
export interface RecipeSection {
  title: string | null;
  ingredients: Ingredient[];
  steps: Step[];
}
```
No `any` types anywhere in the implementation.

### NFR-03-3 — Performance
Sections data is stored in JSONB — reads remain a single query. No additional N+1 queries are introduced.

### NFR-03-4 — Minimal bundle impact
Drag-and-drop reordering in the edit form SHOULD reuse an existing DnD library if one is already in the project (e.g. `@dnd-kit/core` from Feature 02). Do not add a second DnD dependency.

---

## 5. Data Model Impact

Three storage options are under consideration. **This is an open decision — see OQ-03-1.**

---

### Option A — Add `sections` JSONB alongside existing `ingredients` / `steps` (Recommended for v1)

```sql
ALTER TABLE recipes
  ADD COLUMN sections jsonb DEFAULT NULL;

-- sections JSON shape:
-- [
--   {
--     "title": "Für die Soße",
--     "ingredients": [...],
--     "steps": [...]
--   }
-- ]
```

**Pros:**
- Fully backward compatible — existing rows have `sections = NULL`, render as before.
- No migration of existing data required.
- Simple: one new nullable column.

**Cons:**
- Duplication risk: a recipe could have data in both `ingredients`/`steps` AND `sections`. Application logic must enforce a single source of truth.
- Slightly awkward: flat recipes use `ingredients`/`steps`; sectioned recipes use `sections`.

**Mitigation:** On import/save, if `sections` is set, populate `ingredients` and `steps` with a merged flattened copy for backward compat with any consumers that only read the flat columns. Or, deprecate flat columns once all consumers are updated.

---

### Option B — Replace `ingredients` / `steps` with a `sections` array entirely

Migrate all existing recipes to a single `sections` array:
```json
[{ "title": null, "ingredients": [...], "steps": [...] }]
```

Existing flat recipes become single-element sections arrays with `title: null`.

```sql
-- Migration: wrap existing data in sections array
UPDATE recipes
SET sections = jsonb_build_array(
  jsonb_build_object(
    'title', NULL,
    'ingredients', ingredients,
    'steps', steps
  )
)
WHERE sections IS NULL;

-- Eventually drop old columns (phase 2):
-- ALTER TABLE recipes DROP COLUMN ingredients;
-- ALTER TABLE recipes DROP COLUMN steps;
```

**Pros:**
- Single source of truth — no duplication.
- Cleaner data model long-term.

**Cons:**
- Requires a data migration for all existing recipes.
- All existing components that read `recipe.ingredients` / `recipe.steps` directly must be updated.
- Higher risk migration.

---

### Option C — Add `section_id` field to each ingredient and step

Keep the flat `ingredients` and `steps` arrays but add an optional `section_id` and `section_title` field to each item:

```json
{
  "ingredients": [
    { "amount": 400, "unit": "g", "name": "Tomaten", "section_id": "sauce", "section_title": "Für die Soße" }
  ]
}
```

**Pros:**
- No schema change required (JSONB is flexible).
- Existing consumers that ignore unknown fields continue to work.

**Cons:**
- Redundant section_title on every ingredient (denormalized).
- Grouping by section requires client-side aggregation — more complex display logic.
- Fragile: section ordering must be inferred from the data.

---

**Recommendation:** Option A for v1 — minimal risk, no data migration. Plan to evaluate Option B as a cleanup in phase 2 once all consumers are updated.

---

## 6. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-03-1 | Which storage option: A (new `sections` column), B (replace flat columns), or C (section_id in each item)? | Architecture, migration plan | Engineering + Product |
| OQ-03-2 | If Option A: should flat `ingredients`/`steps` be kept in sync (flattened copy) or deprecated? | Backward compat strategy | Engineering |
| OQ-03-3 | How to handle section-level timing? Some recipes have a total time per section (e.g. "30 min for the sauce"). Store on section object or derive from step timers? | Data model | Product |
| OQ-03-4 | Can a recipe have BOTH top-level (unsectioned) ingredients AND section-specific ingredients? E.g. "Salt to taste" applies to the whole recipe. | Data model edge case | Product |
| OQ-03-5 | What is the maximum number of sections? Is there a practical limit? | Validation | Product |

---

## 7. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-03-1 | Storage model | **Option B — migrate all recipes to `sections` JSONB array** | Eliminates dual-column sync bugs; migration is a single SQL UPDATE wrapping existing data |
| OQ-03-2 | Sync flat columns if Option A? | **Moot — Option B chosen** | Drop flat columns after migration transition once all consumers read from `sections` |
| OQ-03-3 | Section-level timing | **Derive from step timers — no separate field** | Step-level `timerSeconds` are the ground truth; no sync problem |
| OQ-03-4 | Top-level + section ingredients simultaneously? | **No — all ingredients must belong to a section** | Use a section titled "Allgemein" for recipe-wide ingredients; avoids two namespaces |
| OQ-03-5 | Max sections | **10 soft cap, client-side validation only** | No DB constraint; raise with a single-line change if needed |

---

## 8. Effort Estimate

**M — 3–8 days**

| Task | Estimate |
|---|---|
| DB migration (Option A) | 1h |
| TypeScript types (`RecipeSection`) | 1h |
| Claude prompt update | 2h |
| API route: parse + save sections | 2h |
| Recipe detail page: section display | 3h |
| Cook mode: section chapter headers | 2h |
| Edit form: section management UI | 5h |
| Edit form: drag-and-drop reorder | 2h |
| Backward compat testing (flat recipes) | 2h |
| QA + edge cases | 3h |
| **Total** | **~23h** |

---

*Feature 03 of 8 — see [README.md](./README.md) for full index*
