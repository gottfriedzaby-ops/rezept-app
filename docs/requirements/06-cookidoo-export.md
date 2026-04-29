# Feature 06 — Cookidoo Recipe Export / Transfer

**Rezepte zu Cookidoo / Thermomix übertragen**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **S** (JSON-LD only) / **L** (.tm5 format) |
| Priority | Low–Medium |
| Dependencies | None |

---

## 1. Overview

Cookidoo is Vorwerk's official recipe platform for Thermomix devices. Users who own a Thermomix want to use the recipes they have imported into this app directly on their device via Cookidoo.

This feature investigates and implements the most feasible path to "transfer" or "export" a recipe toward Cookidoo/Thermomix. It requires careful research because Cookidoo does not offer a public import API.

**Goal:** Provide a practical export mechanism that gets recipe data into a format usable with Thermomix, even if full automatic transfer is not possible in v1.

---

## 2. Research Findings (as of 2026-04-29)

The following findings are based on publicly available information and community research. They MUST be re-verified before implementation begins.

### Finding 1 — Cookidoo has no public import API
As of 2025–2026, Cookidoo (cookidoo.de / cookidoo.com) does **not** offer any documented public API for importing user-created recipes. All recipes on Cookidoo are published by Vorwerk or official content partners. There is no "upload my own recipe" feature on the Cookidoo web platform.

**Implication:** Automatic, direct transfer from this app to Cookidoo is not possible via a standard API integration.

### Finding 2 — Thermomix device format: .tm5 / .tmx
Thermomix TM5 and TM6 devices use a proprietary recipe format (`.tm5` or `.tmx` files) for guided cooking mode. These files can be synced to the device via the Cookidoo app or USB transfer.

Key characteristics of the format:
- XML-based structure (confirmed via community reverse engineering)
- Contains ingredients, steps, timing, temperatures, and speed settings
- Temperature and speed fields are Thermomix-specific (not present in standard recipe data)
- The format is **not officially documented by Vorwerk**
- Community tools exist (e.g. "TM5 Recipe Editor" browser extensions) but are unofficial and potentially fragile

**Implication:** Generating `.tm5`/`.tmx` files is technically feasible but relies on a reverse-engineered format. Vorwerk could break compatibility without notice.

### Finding 3 — schema.org/Recipe is the closest open standard
[schema.org/Recipe](https://schema.org/Recipe) is a widely adopted structured data standard used by Google, Apple, and many recipe platforms. It is the de-facto interoperability format for recipe data on the web.

While Cookidoo does not accept schema.org JSON-LD imports, the format:
- Is accepted by other recipe managers (Paprika, Mela, ChefTap, etc.)
- Can be read by Google Search for rich results
- Represents a useful export format in its own right
- Positions the app for future interoperability

### Finding 4 — Community workarounds for Cookidoo
Current community workarounds include:
- Manually re-entering recipes in the Cookidoo "My Recipes" section (if it exists for their region/plan)
- Using third-party Thermomix recipe apps (Cookmate, Recipe Community) that do accept imports
- Browser extensions that inject recipes into Cookidoo (unofficial, fragile)

**Implication:** There is real user demand for this workflow, but no clean technical path exists today.

### Finding 5 — "Meine Rezepte" on Cookidoo (region-dependent)
Some Cookidoo subscription tiers and regions offer a "Meine Rezepte" (My Recipes) feature where users can manually create and save personal recipes. However:
- This requires a Cookidoo subscription
- Recipes are created via a web form, not via API import
- The feature is not uniformly available across all regions/tiers

---

## 3. User Stories

### US-06-1 — Export recipe as schema.org JSON-LD
> Als Nutzer möchte ich ein Rezept als strukturierte JSON-LD-Datei exportieren können, damit ich es in andere Rezept-Apps importieren kann, die das schema.org-Format unterstützen.

**Acceptance criteria:**
- "Als JSON-LD exportieren" button on the recipe detail page.
- Downloads a `.json` file with valid schema.org/Recipe markup.

---

### US-06-2 — Export recipe as .tm5 file (stretch goal)
> Als Nutzer mit einem Thermomix möchte ich ein Rezept als .tm5-Datei exportieren können, damit ich es auf meinem Gerät verwenden kann.

**Acceptance criteria (stretch goal — v2+):**
- "Als Thermomix-Rezept exportieren (.tm5)" button on the recipe detail page.
- Downloads a `.tm5` file compatible with Thermomix TM5/TM6 import.
- A warning is shown: "Dieses Format ist inoffiziell. Die Kompatibilität kann sich ändern."

---

### US-06-3 — Copy recipe as formatted text for manual entry
> Als Nutzer möchte ich das Rezept als formatierten Text in die Zwischenablage kopieren können, damit ich es schnell manuell in Cookidoo oder ein anderes System übertragen kann.

**Acceptance criteria:**
- "Rezept kopieren" button copies a human-readable text block to the clipboard.
- Format: title, servings, ingredients (one per line), numbered steps.

---

## 4. Functional Requirements

### FR-06-1 — schema.org/Recipe JSON-LD export (v1 scope)
The recipe detail page MUST have an export action that generates a valid [schema.org/Recipe](https://schema.org/Recipe) JSON-LD document.

The output MUST map Rezept-App fields to schema.org properties as follows:

| Rezept-App field | schema.org property |
|---|---|
| `title` | `name` |
| `description` | `description` |
| `servings` | `recipeYield` |
| `prep_time` | `prepTime` (ISO 8601 duration: `PT{n}M`) |
| `cook_time` | `cookTime` (ISO 8601 duration) |
| `ingredients[].amount + unit + name` | `recipeIngredient` (string array) |
| `steps[].text` | `recipeInstructions[].text` (HowToStep) |
| `tags` | `keywords` |
| `image_url` | `image` |
| `source_value` (if URL) | `url` |

### FR-06-2 — JSON-LD file download
The exported file MUST:
- Be named `{slugified-title}.json`
- Have `Content-Type: application/ld+json`
- Be valid JSON (parseable with `JSON.parse`)
- Be valid schema.org/Recipe (verifiable with Google's Rich Results Test)

### FR-06-3 — Clipboard copy (v1 scope)
A secondary "Rezept kopieren" action MUST copy a plain-text representation of the recipe to the clipboard with a brief confirmation toast: "In Zwischenablage kopiert".

### FR-06-4 — User guidance for Cookidoo
Since direct Cookidoo import is not available, the export section MUST include a brief help text:

> "Cookidoo bietet derzeit keine direkte Import-Funktion. Du kannst das Rezept als JSON-LD exportieren (für andere Apps) oder den Text kopieren, um es manuell in Cookidoo einzugeben."

### FR-06-5 — .tm5 export (out of scope v1, stretch goal v2)
Implementation of `.tm5` format export is explicitly out of scope for v1. If pursued in v2:
- Research the most current reverse-engineered spec (community GitHub repos)
- Add Thermomix-specific fields: temperature (°C), speed (0–10), and mode per step
- Claude parsing prompt would need to extract these values during import (requires Thermomix-specific instructions)
- Provide prominent "unofficial format" warning

---

## 5. Non-Functional Requirements

### NFR-06-1 — No API calls for JSON-LD export
JSON-LD export MUST be generated client-side from already-loaded recipe data. No server round-trip required.

### NFR-06-2 — Valid schema.org markup
The generated JSON-LD MUST pass Google's [Rich Results Test](https://search.google.com/test/rich-results) for the Recipe type. This ensures maximum compatibility with third-party apps.

### NFR-06-3 — No dependency on Cookidoo platform
This feature MUST NOT depend on any Cookidoo API, login, or scraping. It must remain stable regardless of Cookidoo platform changes.

### NFR-06-4 — Monitoring for Cookidoo API changes
The team SHOULD set a calendar reminder to re-evaluate Cookidoo's official API availability every 6 months. If Vorwerk releases an official import API, this document MUST be updated.

---

## 6. Ranked Options by Feasibility

| Rank | Option | Feasibility | Effort | Notes |
|---|---|---|---|---|
| 1 | schema.org JSON-LD export | High | S | Open standard; useful beyond Cookidoo |
| 2 | Clipboard plain-text copy | High | XS | Good workaround for manual Cookidoo entry |
| 3 | `.tm5` / `.tmx` file export | Medium | L | Unofficial format; fragile; Thermomix-specific fields missing |
| 4 | Official Cookidoo API | None currently | — | Monitor; implement if/when released |

---

## 7. Implementation Plan (v1)

v1 implements **Option 1 (JSON-LD)** and **Option 2 (clipboard copy)** only.

### schema.org/Recipe JSON-LD builder utility

```ts
// /lib/schemaOrg.ts
import type { Recipe } from '@/types';

export function toSchemaOrgRecipe(recipe: Recipe): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    description: recipe.description ?? undefined,
    recipeYield: recipe.servings?.toString(),
    prepTime: recipe.prep_time ? `PT${recipe.prep_time}M` : undefined,
    cookTime: recipe.cook_time ? `PT${recipe.cook_time}M` : undefined,
    image: recipe.image_url ?? undefined,
    keywords: recipe.tags.join(', '),
    recipeIngredient: recipe.ingredients.map(
      (i) => `${i.amount} ${i.unit} ${i.name}`.trim()
    ),
    recipeInstructions: recipe.steps.map((s) => ({
      '@type': 'HowToStep',
      text: s.text,
    })),
    url: recipe.source_type === 'url' ? recipe.source_value : undefined,
  };
}
```

---

## 8. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-06-1 | Has Cookidoo released any official import API or "Meine Rezepte" import feature since this document was written (2026-04-29)? | Could change the entire approach | Product (re-verify before implementation) |
| OQ-06-2 | Is the `.tm5` format documented officially anywhere by Vorwerk? | Determines feasibility of Option 3 | Engineering (research) |
| OQ-06-3 | Should the JSON-LD export also be embedded in the recipe detail page's `<head>` as structured data (for SEO)? | SEO benefit, minimal extra effort | Engineering |
| OQ-06-4 | Are there third-party Thermomix apps (Cookmate, Recipe Community) worth targeting with their own import formats? | Could provide a better Thermomix path than .tm5 | Product |
| OQ-06-5 | Should `.tm5` export be v2 scope or permanently deferred? | Roadmap | Product |

---

## 9. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-06-1 | Re-verify Cookidoo API? | **No — proceed with JSON-LD + clipboard plan** | Set 6-month calendar reminder as doc suggests |
| OQ-06-2 | Research `.tm5` format? | **Yes — promote to v2 scope** | Owner confirmed TM7 ownership; `.tm5` export is a real, confirmed use case |
| OQ-06-3 | Embed JSON-LD in `<head>`? | **Yes** | Reuses `toSchemaOrgRecipe()` utility; < 30 min; adds SEO benefit |
| OQ-06-4 | Target Cookmate / third-party apps? | **No** | Small user bases; schema.org covers major recipe managers |
| OQ-06-5 | `.tm5` scope | **v2 scope** | Owner has TM7; research official and community format docs before implementing |

---

## 10. Effort Estimate

| Scope | Tasks | Estimate |
|---|---|---|
| **v1: JSON-LD + clipboard** | `toSchemaOrgRecipe` utility, download button, clipboard copy, UI guidance text | **S (~6h)** |
| **v2 stretch: .tm5 export** | Format research, XML builder, step field mapping, Thermomix fields in Claude prompt, warning UI | **L (~20–30h)** |

---

*Feature 06 of 8 — see [README.md](./README.md) for full index*
