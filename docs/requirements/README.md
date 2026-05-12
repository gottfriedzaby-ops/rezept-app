# Rezept-App — Requirements Index

This directory contains feature requirement documents for the **Rezept-App** — a Next.js 14 recipe import and management application.

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript strict) |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| AI / Parsing | Claude API (`claude-sonnet-4-6`) |
| Deployment | Vercel |

---

## Feature Overview

| # | Feature | Summary | Status | Doc |
|---|---|---|---|---|
| 01 | Recipe Type Distinction | Distinguish Kochen / Backen / Grillen / Zubereiten so labels and CTA buttons adapt | ✅ Done | [01-recipe-type.md](./01-recipe-type.md) |
| 02 | Multi-Image Recipe Import | Allow uploading multiple photos (e.g. Instagram carousel) to import a single recipe | ✅ Done | [02-multi-image-import.md](./02-multi-image-import.md) |
| 03 | Multi-Section Recipes | Support recipes with named sections (e.g. "Für die Soße" + "Für den Teig") with separate ingredient and step lists | ✅ Done | [03-multi-section-recipes.md](./03-multi-section-recipes.md) |
| 04 | PDF Export | Generate a print-friendly PDF for a single recipe from the detail page | ✅ Done | [04-pdf-export.md](./04-pdf-export.md) |
| 05 | Auth & Sharing | Multi-user authentication (email + Google OAuth) and read-only recipe collection sharing via revocable tokens | ✅ Done | [05-auth-and-sharing.md](./05-auth-and-sharing.md) |
| 06 | Cookidoo Export | schema.org JSON-LD download + plain-text copy (no public Cookidoo API exists) | ✅ Done | [06-cookidoo-export.md](./06-cookidoo-export.md) |
| 07 | Shopping List | Add scaled recipe ingredients to a persistent, checkable shopping list (localStorage tier) | ✅ Done | [07-shopping-list.md](./07-shopping-list.md) |
| 08 | Nutrition Calculation | Claude-estimated kcal and macros per serving, calculated on import and recalculable on demand | ✅ Done | [08-nutrition-calculation.md](./08-nutrition-calculation.md) |
| 09 | User-Scoped Duplicate Check | Duplicate detection scoped per user so different users can import the same URL independently | ✅ Done | [09-user-scoped-duplicate-check.md](./09-user-scoped-duplicate-check.md) |
| 09b | Library Sharing | Read-only tokenised public library sharing at `/shared/[token]` and `/library-shares/[ownerId]` | ✅ Done | [09_library_sharing.md](./09_library_sharing.md) |
| 10 | PDF Import | Import recipes from uploaded PDF files | ✅ Done | [10-pdf-import.md](./10-pdf-import.md) |
| 11 | Unified Library Display | Unified view combining own + shared-library recipes | ✅ Done | [11-unified-library-display.md](./11-unified-library-display.md) |

### Frontend Improvements (no DB migrations)

| # | Improvement | Components | Status |
|---|---|---|---|
| FE-01 | Keyboard Navigation in Cook Mode | `CookMode.tsx` | ✅ Done |
| FE-02 | Sticky Progress Bar in Cook Mode | `CookMode.tsx` | ✅ Done |
| FE-03 | Empty-State Illustration on Recipe List | `RecipeList.tsx` | ✅ Done |
| FE-04 | Ingredient Checklist in Cook Mode | `CookMode.tsx` | ✅ Done |
| FE-05 | Scroll-to-Top + Step Images in Cook Mode | `CookMode.tsx` | ✅ Done |
| FE-06 | Expanded Search (Ingredients + Tags) | `RecipeList.tsx` | ✅ Done |
| FE-07 | Sort Control for Recipe List | `RecipeList.tsx` | ✅ Done |
| FE-08 | `next/image` for Recipe Covers | `RecipeCover.tsx`, `next.config.js` | ✅ Done |
| FE-09 | Inline Tag Editor with Colour Preview | `TagInput.tsx` (new), forms | ✅ Done |
| FE-10 | Persist Filter State in the URL | `RecipeList.tsx`, `page.tsx` | ✅ Done |

---

## Effort Legend

| Label | Rough estimate |
|---|---|
| **S** | 1–3 days (1 developer) |
| **M** | 3–8 days |
| **L** | 8+ days / involves multiple systems |

Estimates assume a single full-stack developer familiar with the codebase. Features marked with two levels (e.g. **S / L**) depend on which implementation path is chosen — details in the individual doc.

---

## Dependencies Between Features

```
05 (Auth)
  └─ unlocks server-side persistence for 07 (Shopping List)
  └─ required before 05 sharing features work end-to-end

03 (Multi-Section)
  └─ affects how 07 (Shopping List) aggregates ingredients

02 (Multi-Image)
  └─ standalone, but pairs naturally with 03 (Multi-Section)
```

---

## Document Structure

Each feature doc follows this template:

1. **Overview** — problem statement and goal
2. **User Stories** — end-user perspective (German UI text)
3. **Functional Requirements** — numbered, testable requirements
4. **Non-Functional Requirements** — performance, compatibility, security
5. **Data Model Impact** — schema changes or additions
6. **Technical Options** — implementation paths (where multiple exist)
7. **Open Questions** — decisions not yet made
8. **Effort Estimate**

---

*Last updated: 2026-05-12 — 11 backend features + 10 frontend improvements shipped*
