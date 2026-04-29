# Feature 01 — Recipe Type Distinction

**Kochen / Backen / Grillen / Zubereiten**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **S** (1–3 days) |
| Priority | High |
| Dependencies | None |

---

## 1. Overview

Recipes in the app currently share a single set of time labels ("Kochzeit", "Zubereitungszeit") and a single cook-mode call-to-action button ("Jetzt kochen") regardless of what kind of preparation the recipe actually involves. A baking recipe and a grilling recipe have fundamentally different contexts.

This feature introduces a `recipe_type` field that classifies every recipe into one of four preparation types: **kochen**, **backen**, **grillen**, or **zubereiten**. The UI then adapts time labels, cook-mode CTA labels, and recipe card badges to match the type.

**Goal:** Make the app feel contextually aware — a bread recipe should say "Backzeit" and "Jetzt backen", not "Kochzeit" and "Jetzt kochen".

---

## 2. User Stories

### US-01-1 — Adapted time label for baking recipes
> As a user, I want the recipe detail page to show "Backzeit" instead of "Kochzeit" for baking recipes, so that the terminology matches what I'm actually doing.

**Acceptance criteria:**
- Recipe with `recipe_type = 'backen'` shows "Backzeit" wherever "Kochzeit" would otherwise appear.
- "Gesamtzeit" label remains the same for all types.

---

### US-01-2 — Adapted cook-mode CTA button
> Als Nutzer möchte ich, dass der Button auf der Rezeptdetailseite "Jetzt backen" heißt, wenn ich ein Backrezept öffne, damit die Aufforderung zum richtigen Kontext passt.

**Acceptance criteria:**
- Button label is one of: "Jetzt kochen" / "Jetzt backen" / "Jetzt grillen" / "Jetzt zubereiten".
- Label is derived from `recipe_type`.

---

### US-01-3 — Visual type badge on recipe cards
> Als Nutzer möchte ich auf der Rezeptübersicht auf einen Blick erkennen, ob ein Rezept ein Koch-, Back-, Grill- oder Zubereitungsrezept ist, damit ich schnell die richtige Kategorie finde.

**Acceptance criteria:**
- Recipe cards show a type badge or icon.
- Badge is visually distinct per type (icon and/or color).

---

### US-01-4 — Manual type override
> Als Nutzer möchte ich den Typ eines Rezepts manuell ändern können, falls die KI-Erkennung falsch lag, damit meine Rezepte korrekt kategorisiert sind.

**Acceptance criteria:**
- Edit form includes a dropdown or segmented control for `recipe_type`.
- Saving updates the DB and immediately refreshes the UI labels.

---

## 3. Functional Requirements

### FR-01-1 — New `recipe_type` field
The `recipes` table MUST have a new column `recipe_type` with the following constraints:
- Type: `text`
- Allowed values: `'kochen'`, `'backen'`, `'grillen'`, `'zubereiten'`
- Default: `'kochen'`
- NOT NULL
- Enforced via CHECK constraint

### FR-01-2 — Claude extracts `recipe_type` on import
The Claude parsing prompt MUST request `recipe_type` in its JSON output:
```json
{
  "recipe_type": "kochen | backen | grillen | zubereiten"
}
```
Claude's system instructions MUST include classification guidance (e.g. "backen" for oven-baked goods requiring precise temperature and timing, "grillen" for open-flame or griddle cooking, "zubereiten" for no-cook/assembly recipes such as salads and smoothies).

If Claude returns an unrecognized value or omits the field, the API route MUST default to `'kochen'`.

### FR-01-3 — Time label mapping
The UI MUST adapt the cook time label according to `recipe_type`:

| `recipe_type` | Cook time label | Active verb |
|---|---|---|
| `kochen` | Kochzeit | Kochen |
| `backen` | Backzeit | Backen |
| `grillen` | Grillzeit | Grillen |
| `zubereiten` | Zubereitungszeit | Zubereiten |

"Gesamtzeit" (= prep_time + cook_time) remains unchanged for all types.

The prep time label ("Vorbereitungszeit") remains unchanged for all types.

### FR-01-4 — Cook-mode CTA button label
The "start cooking" button on the recipe detail page MUST use the adapted verb:
- `kochen` → **"Jetzt kochen"**
- `backen` → **"Jetzt backen"**
- `grillen` → **"Jetzt grillen"**
- `zubereiten` → **"Jetzt zubereiten"**

### FR-01-5 — Recipe card type badge
Each recipe card in the list view MUST display a visual indicator of `recipe_type`. Implementation may use:
- A small icon (e.g. 🍳 kochen, 🍞 backen, 🔥 grillen, 🥗 zubereiten), OR
- A colored pill badge with the type name, OR
- Both.

The chosen style MUST be consistent across all cards.

### FR-01-6 — Edit form type selector
The recipe edit form MUST include a selector for `recipe_type` (dropdown or segmented button group). The current value MUST be pre-selected. Saving MUST persist the updated value to Supabase.

### FR-01-7 — Manual recipe creation (import type = `manual`)
When a user creates a recipe manually (not via AI import), the type selector MUST be shown during creation with `'kochen'` as the pre-selected default.

### FR-01-8 — Filter by type (optional, stretch goal)
The recipe list MAY offer a filter by `recipe_type` so users can browse all "Backrezepte" separately. This is NOT required for v1 of this feature.

---

## 4. Non-Functional Requirements

### NFR-01-1 — Backward compatibility
Existing recipes that do not have a `recipe_type` value MUST display and function correctly. The DB migration MUST set `DEFAULT 'kochen'` so that all existing rows receive a valid value without data loss.

### NFR-01-2 — TypeScript types
The `Recipe` TypeScript type in `/types` MUST be updated to include:
```ts
recipe_type: 'kochen' | 'backen' | 'grillen' | 'zubereiten';
```
No `any` types. All consumers of the `Recipe` type MUST be updated.

### NFR-01-3 — No performance regression
The type badge and label adaptation MUST be derived from already-loaded recipe data. No additional network requests MUST be made for this feature.

### NFR-01-4 — German UI text
All user-facing labels MUST be in German. `recipe_type` enum values MUST be stored in German lowercase (as specified) to serve as both DB values and UI-friendly display strings.

---

## 5. Data Model Impact

### Migration SQL

```sql
-- Add recipe_type column to recipes table
ALTER TABLE recipes
  ADD COLUMN recipe_type text NOT NULL DEFAULT 'kochen'
  CHECK (recipe_type IN ('kochen', 'backen', 'grillen', 'zubereiten'));

-- Optional: index for filtering
CREATE INDEX recipes_type_idx ON recipes (recipe_type);
```

### Updated TypeScript type (`/types/recipe.ts`)

```ts
export type RecipeType = 'kochen' | 'backen' | 'grillen' | 'zubereiten';

export interface Recipe {
  // ... existing fields ...
  recipe_type: RecipeType;
}
```

### Updated Claude API output schema (`/lib/claude.ts`)

```json
{
  "recipe_type": "kochen | backen | grillen | zubereiten"
}
```

---

## 6. UI Component Impact

| Component | Change required |
|---|---|
| `RecipeCard` | Add type badge |
| `RecipeDetailHeader` | Adapt cook time label |
| `CookModeButton` | Adapt CTA label |
| `RecipeEditForm` | Add type selector |
| `RecipeCreateForm` | Add type selector (default: kochen) |
| `/lib/claude.ts` | Include recipe_type in prompt |
| `/app/api/import-*` | Validate and default recipe_type |

---

## 7. Label Utility Helper

A shared utility function MUST be created to centralize the label mapping:

```ts
// /lib/recipeTypeLabels.ts
export const cookTimeLabelFor = (type: RecipeType): string => ({
  kochen: 'Kochzeit',
  backen: 'Backzeit',
  grillen: 'Grillzeit',
  zubereiten: 'Zubereitungszeit',
}[type]);

export const ctaLabelFor = (type: RecipeType): string => ({
  kochen: 'Jetzt kochen',
  backen: 'Jetzt backen',
  grillen: 'Jetzt grillen',
  zubereiten: 'Jetzt zubereiten',
}[type]);
```

This avoids duplicating the mapping in every component.

---

## 8. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-01-1 | Should the 4 types be fixed permanently, or should the system be extensible (e.g. future "Einmachen", "Räuchern")? | If extensible, CHECK constraint must be replaced with a lookup table | Product |
| OQ-01-2 | Should users be able to manually override the `recipe_type` after import? | If yes, FR-01-6 is required; if no, it can be skipped | Product |
| OQ-01-3 | Should "zubereiten" be a catch-all fallback instead of "kochen"? | Changes default value in migration | Product |
| OQ-01-4 | Should the type filter (FR-01-8) be in v1 or a follow-up? | Scope | Product |

---

## 9. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-01-1 | Fixed 4 types or extensible? | **Fixed 4 types** with CHECK constraint | Extend the constraint later if a 5th type is genuinely needed |
| OQ-01-2 | Manual override in edit form? | **Yes** — FR-01-6 in scope | Claude will occasionally misclassify; edit form fix is < 2 hours |
| OQ-01-3 | Fallback type | **"kochen"** as default | Covers the majority of recipes; wrong baking recipes are easy to spot and fix |
| OQ-01-4 | Type filter in v1? | **No — follow-up** | Add filter when collection grows large enough to need it |

---

## 10. Effort Estimate

**S — 1–3 days**

| Task | Estimate |
|---|---|
| DB migration | 0.5h |
| TypeScript type updates | 1h |
| Claude prompt update + parsing | 1h |
| Label utility helper | 0.5h |
| UI: RecipeCard badge | 1h |
| UI: Detail page label + CTA | 1h |
| UI: Edit/Create form selector | 2h |
| Testing + QA | 2h |
| **Total** | **~9h** |

---

*Feature 01 of 8 — see [README.md](./README.md) for full index*
