# Feature 08 — Calorie and Nutrition Calculation

**Kalorien und Nährwerte pro Portion berechnen**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **M** (Claude estimation) / **L** (external nutrition API) |
| Priority | Medium |
| Dependencies | None (but complements Feature 07 — Shopping List) |

---

## 1. Overview

Users want to know the approximate calorie and macro content of their recipes — not for strict calorie counting, but for general awareness. Displaying "ca. 520 kcal pro Portion" and a basic protein/carbs/fat breakdown on the recipe detail page is a highly requested quality-of-life feature.

Nutrition data must be calculated or estimated per ingredient, then aggregated to a per-serving total.

**Goal:** Display accurate-enough nutrition data on every recipe detail page. "Accurate enough" means within ~20–30% of the true value for typical home-cooking recipes.

---

## 2. User Stories

### US-08-1 — See calorie count on recipe detail
> Als Nutzer möchte ich auf der Rezeptdetailseite sehen, wie viele Kalorien eine Portion des Rezepts hat, damit ich einen groben Überblick über den Energiegehalt bekomme.

**Acceptance criteria:**
- Recipe detail page shows "ca. {kcal} kcal pro Portion" when data is available.
- Displayed next to or below the servings/time metadata.
- If no data is available, the field is hidden (not shown as "0 kcal").

---

### US-08-2 — See macro breakdown
> Als Nutzer möchte ich neben den Kalorien auch Protein-, Kohlenhydrat- und Fettgehalt sehen, damit ich das Rezept besser in meinen Ernährungsplan einordnen kann.

**Acceptance criteria:**
- Macro breakdown shown as three values: Protein X g · Kohlenhydrate X g · Fett X g.
- Values are per serving.
- Displayed in a compact row below the kcal value or in a collapsible "Nährwerte" section.

---

### US-08-3 — Nutrition calculated automatically on import
> Als Nutzer möchte ich, dass Nährwerte automatisch beim Import berechnet werden, damit ich nichts manuell eingeben muss.

**Acceptance criteria:**
- Nutrition calculation is triggered automatically after a recipe is saved.
- The recipe detail page shows nutrition data on the first visit after import (may be a short delay).
- Import does not fail if nutrition calculation fails — it degrades gracefully.

---

### US-08-4 — "Nährwerte nicht verfügbar" for failed lookups
> Als Nutzer möchte ich eine klare Meldung sehen, wenn keine Nährwerte berechnet werden konnten, damit ich nicht von leeren Feldern verwirrt werde.

**Acceptance criteria:**
- If all nutrition columns are NULL, a subtle "Nährwerte nicht verfügbar" label is shown (or the section is hidden entirely — see OQ-08-4).
- No error state is surfaced to the user if the background calculation fails.

---

### US-08-5 — Manual recalculate button
> Als Nutzer möchte ich die Nährwerte neu berechnen lassen können, falls ich ein Rezept bearbeitet habe, damit die Angaben nach einer Änderung aktuell sind.

**Acceptance criteria:**
- A "Nährwerte neu berechnen" button is available on the recipe detail page (or in the edit form).
- Triggers a re-calculation API call.
- Shows a loading state during calculation.
- Updates the displayed values after completion.

---

### US-08-6 — Per-ingredient breakdown (optional detail)
> Als Nutzer möchte ich optional sehen können, welche Zutat wie viele Kalorien beisteuert, damit ich verstehe, welche Zutaten den Energiegehalt dominieren.

**Acceptance criteria (optional — lower priority):**
- "Aufschlüsselung anzeigen" toggle reveals a per-ingredient kcal breakdown.
- Shows ingredient name + estimated kcal contribution.

---

## 3. Functional Requirements

### FR-08-1 — Trigger nutrition calculation on recipe save
After a recipe is successfully saved to Supabase (on any import type: URL, YouTube, photo, manual), the system MUST trigger a nutrition calculation:
- Fire-and-forget: the import API route MUST return immediately to the client without waiting for nutrition calculation.
- Nutrition calculation runs as a background job (async) or in a separate API call triggered after the recipe ID is known.

### FR-08-2 — Per-serving calculation
Nutrition values MUST be stored and displayed **per serving**:
```
kcal_per_serving = total_kcal / recipe.servings
protein_g = total_protein_g / recipe.servings
carbs_g = total_carbs_g / recipe.servings
fat_g = total_fat_g / recipe.servings
```
If `recipe.servings` is null or 0, store `NULL` for all nutrition columns.

### FR-08-3 — Graceful degradation
If the nutrition calculation fails (API timeout, ingredient not found, etc.):
- Do NOT fail the recipe import.
- Leave nutrition columns as `NULL`.
- Log the error server-side.
- The recipe is still fully usable without nutrition data.

### FR-08-4 — Display on recipe detail
When `kcal_per_serving` is not NULL, the recipe detail page MUST show:
```
ca. {kcal_per_serving} kcal pro Portion
Protein {protein_g} g  ·  Kohlenhydrate {carbs_g} g  ·  Fett {fat_g} g
```
Values are rounded to integers for display (no decimal places shown to user).

### FR-08-5 — "Nährwerte nicht verfügbar"
When all nutrition columns are NULL, display a subtle fallback. Options (open decision):
- Hide the entire section
- Show "Nährwerte nicht verfügbar" in a muted style

### FR-08-6 — Manual recalculate
A "Nährwerte neu berechnen" button MUST trigger a POST to `/api/recipes/{id}/nutrition`. The route MUST:
- Re-run the nutrition calculation for all ingredients.
- Update the four nutrition columns in Supabase.
- Return updated values.

### FR-08-7 — Per-ingredient breakdown (optional — lower priority)
If implemented, the breakdown MUST show each ingredient's estimated kcal contribution:
```
Mehl (300g) ......... ca. 1080 kcal
Butter (150g) ....... ca. 1120 kcal
Eier (2 Stück) ...... ca. 160 kcal
```
Implementable as a collapsible section. Data stored in a separate JSONB column `nutrition_breakdown` or derived on the fly from the nutrition API response.

---

## 4. Non-Functional Requirements

### NFR-08-1 — Fire-and-forget calculation
Nutrition calculation MUST NOT block the recipe import response. The user MUST see their recipe immediately after import. Nutrition data may appear seconds or minutes later.

### NFR-08-2 — Accuracy expectations
Users MUST be shown a disclaimer indicating that values are estimates:
- Display text: "ca." before kcal values ("ca. 520 kcal")
- Tooltip or small note: "Nährwertangaben sind Schätzwerte und können abweichen."

### NFR-08-3 — Rate limiting awareness
If using an external nutrition API (Option 3 or 4), the implementation MUST:
- Cache results so the same ingredient is not looked up multiple times.
- Implement exponential backoff on API errors.
- Handle 429 (rate limit) responses gracefully.

### NFR-08-4 — Cost awareness
If using a paid nutrition API, the team MUST establish a monthly budget cap and implement request counting/alerting before exceeding free tier limits.

### NFR-08-5 — Null safety in TypeScript
The `Recipe` TypeScript type MUST declare all nutrition fields as nullable:
```ts
kcal_per_serving: number | null;
protein_g: number | null;
carbs_g: number | null;
fat_g: number | null;
```
All UI components MUST handle null values gracefully.

---

## 5. Data Model Impact

### `recipes` table — new columns

```sql
ALTER TABLE recipes
  ADD COLUMN kcal_per_serving numeric,
  ADD COLUMN protein_g        numeric,
  ADD COLUMN carbs_g          numeric,
  ADD COLUMN fat_g            numeric;

-- Optional: store per-ingredient breakdown
ALTER TABLE recipes
  ADD COLUMN nutrition_breakdown jsonb DEFAULT NULL;
-- [{ "name": "Mehl", "amount": 300, "unit": "g", "kcal": 1080 }]
```

All four columns are nullable — existing rows default to NULL.

### TypeScript type update (`/types/recipe.ts`)

```ts
export interface Recipe {
  // ... existing fields ...
  kcal_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  nutrition_breakdown?: NutritionIngredient[] | null;
}

export interface NutritionIngredient {
  name: string;
  amount: number;
  unit: string;
  kcal: number;
}
```

---

## 6. Technical Options

Six implementation options are under consideration. **This is an open decision — see OQ-08-1.**

---

### Option 1 — Open Food Facts API (free, open-source)

[world.openfoodfacts.org/api](https://world.openfoodfacts.org/api)

- Free, no API key required.
- Community-maintained database of ~3 million products.
- Good coverage for packaged goods (Aldi, Rewe, DM brands).
- Coverage for raw ingredients (e.g. "Weizenmehl Type 550") is moderate.
- API search: fuzzy match by product name.

**Pros:** Free, open-source, German product coverage improving.
**Cons:** Inconsistent quality for raw ingredients; requires name matching/normalization logic.

**Effort:** M (requires ingredient name normalization and fuzzy matching to the product database).

---

### Option 2 — USDA FoodData Central (free, US-centric)

[fdc.nal.usda.gov/api-guide.html](https://fdc.nal.usda.gov/api-guide.html)

- Free with API key.
- Authoritative nutritional data for raw foods and branded products.
- English-language database — German ingredient names must be translated first.

**Pros:** High accuracy for raw ingredients; free.
**Cons:** English-only; German recipes require ingredient name translation (additional Claude API call or static mapping).

**Effort:** M (requires translation layer for German ingredient names).

---

### Option 3 — Edamam Nutrition Analysis API

[developer.edamam.com](https://developer.edamam.com/edamam-nutrition-api)

- Accepts natural language ingredient strings: `"300g Weizenmehl"` → returns kcal, macros.
- No need for separate ingredient name normalization.
- Free tier: ~400 calls/month.
- Paid: ~$29/month for 10,000 calls.

**Pros:** Simplest integration; accepts the ingredient format already in the DB; German language support.
**Cons:** Paid above free tier; external dependency; cost scales with usage.

**Effort:** S–M.

---

### Option 4 — Spoonacular API

[spoonacular.com/food-api](https://spoonacular.com/food-api)

- All-in-one recipe and nutrition API.
- Endpoint: `POST /recipes/parseIngredients` → returns nutrition per ingredient.
- Free tier: 150 calls/day.
- Paid: $29/month for higher limits.

**Pros:** Well-documented, widely used; returns per-ingredient breakdown natively.
**Cons:** Paid above free tier; primarily English; German support limited.

**Effort:** S–M.

---

### Option 5 — Claude estimation (no external API)

Extend the existing Claude parsing call (or add a second call) to have Claude estimate kcal and macros based on its training knowledge.

```
System prompt addition:
"Also estimate nutrition per serving: kcal_per_serving, protein_g, carbs_g, fat_g.
Base estimates on standard nutritional values for the listed ingredients.
Mark estimates with a ~20% accuracy range."
```

**Pros:**
- No additional API integration — already using Claude.
- No additional cost beyond token usage.
- Handles unusual ingredients that aren't in food databases.
- Works for any language.

**Cons:**
- Lower accuracy than a dedicated nutrition database (~20–30% margin of error).
- Claude may hallucinate values for obscure ingredients.
- Not verifiable without a ground-truth database.

**Effort:** S (add fields to Claude prompt + parser).

---

### Option 6 — Hybrid: Claude estimates + user correction flag

Claude provides initial estimates (Option 5). Users can flag values as "unreliable" and optionally enter manual values. The flag triggers a more expensive lookup via Edamam or Open Food Facts in the background.

**Pros:**
- Fast and cheap by default.
- Accuracy improves over time for frequently corrected recipes.

**Cons:**
- Complex state management (estimated vs. verified vs. manual).
- UI complexity for the correction flow.

**Effort:** M–L.

---

**Recommendation:** Start with **Option 5 (Claude estimation)** as v1 — zero new API integrations, immediate results, good enough for most users who want ballpark figures. Migrate to Option 3 (Edamam) if users demand higher accuracy.

---

## 7. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-08-1 | Which data source: Claude estimation, Open Food Facts, Edamam, Spoonacular, or hybrid? | Architecture, cost, accuracy | Engineering + Product |
| OQ-08-2 | Is Claude estimation accuracy (~20% margin) acceptable for this app's users? | Product decision | Product |
| OQ-08-3 | Should per-ingredient kcal breakdown (US-08-6) be in v1 scope or a follow-up? | Scope | Product |
| OQ-08-4 | If no nutrition data is available: hide the section entirely, or show "Nährwerte nicht verfügbar"? | UX | Product |
| OQ-08-5 | Should nutrition values be shown on recipe cards in the list view (e.g. "520 kcal"), or only on the detail page? | UI scope | Product |
| OQ-08-6 | Should there be a confidence indicator (e.g. "Schätzwert" badge) for Claude-estimated values? | UX, trust | Product |
| OQ-08-7 | Are there GDPR or health-claims regulations that affect displaying kcal/macro data in a German app? | Legal | Product + Legal |

---

## 8. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-08-1 | Data source | **Claude estimation only (Option 5)** | Already in stack; no new API key or cost; ~20% accuracy sufficient for ballpark figures |
| OQ-08-2 | 20% accuracy margin acceptable? | **Yes** | Home recipes are inherently variable; "ca." prefix sets correct expectations |
| OQ-08-3 | Per-ingredient breakdown in v1? | **No — follow-up** | Total kcal + macros is the primary need; breakdown is v2 when there's real demand |
| OQ-08-4 | No data: hide or show notice? | **Hide the section entirely** | Silently appears once ready; no visual noise during import |
| OQ-08-5 | Kcal on recipe cards? | **No — detail page only** | Cards are already information-dense; kcal is secondary context |
| OQ-08-6 | Confidence indicator? | **"ca." prefix + one-line "Schätzwerte, können abweichen." disclaimer** | "ca." prefix already signals estimation; no badge/tooltip complexity needed |
| OQ-08-7 | GDPR/health regulations? | **No action required** | Personal app; no commercial health claims; disclaimer is sufficient good practice |

---

## 9. Effort Estimate

| Path | Tasks | Estimate |
|---|---|---|
| **Option 5: Claude estimation** | Add nutrition fields to Claude prompt, update parser, add DB columns, nutrition display component, recalculate button | **M (~12–16h)** |
| **Option 3: Edamam API** (additional) | API integration, ingredient-to-query serialization, response mapping, caching, rate limit handling, per-ingredient breakdown | **L (+16–20h on top of Option 5)** |
| **Per-ingredient breakdown UI** | Collapsible breakdown component, data storage | **+4h** |

---

*Feature 08 of 8 — see [README.md](./README.md) for full index*
