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

| # | Feature | Summary | Effort | Doc |
|---|---|---|---|---|
| 01 | Recipe Type Distinction | Distinguish Kochen / Backen / Grillen / Zubereiten so labels and CTA buttons adapt | **S** | [01-recipe-type.md](./01-recipe-type.md) |
| 02 | Multi-Image Recipe Import | Allow uploading multiple photos (e.g. Instagram carousel) to import a single recipe | **M** | [02-multi-image-import.md](./02-multi-image-import.md) |
| 03 | Multi-Section Recipes | Support recipes with named sections (e.g. "Für die Soße" + "Für den Teig") with separate ingredient and step lists | **M** | [03-multi-section-recipes.md](./03-multi-section-recipes.md) |
| 04 | PDF Export | Generate a print-friendly PDF for a single recipe from the detail page | **S–M** | [04-pdf-export.md](./04-pdf-export.md) |
| 05 | Auth & Sharing | Multi-user authentication (email, Google, Apple) and read-only recipe collection sharing | **L** | [05-auth-and-sharing.md](./05-auth-and-sharing.md) |
| 06 | Cookidoo Export | Transfer/export recipes toward Cookidoo / Thermomix; uses schema.org JSON-LD as v1 | **S / L** | [06-cookidoo-export.md](./06-cookidoo-export.md) |
| 07 | Shopping List | Add scaled recipe ingredients to a persistent, checkable shopping list | **M / M+** | [07-shopping-list.md](./07-shopping-list.md) |
| 08 | Nutrition Calculation | Calculate kcal and macros per serving on import; display on recipe detail page | **M / L** | [08-nutrition-calculation.md](./08-nutrition-calculation.md) |

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

*Last updated: 2026-04-29*
