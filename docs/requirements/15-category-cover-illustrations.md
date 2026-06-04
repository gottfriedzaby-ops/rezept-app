# FE-15 — Category Cover Illustrations for Image-less Recipes

|              |                                                                          |
| ------------ | ------------------------------------------------------------------------ |
| ID           | FE-15                                                                    |
| Priority     | Medium                                                                   |
| Effort       | S                                                                        |
| Components   | `components/RecipeCover.tsx`, `public/categories/*.svg`, cover call sites |
| Schema change | No                                                                      |

## Problem

Many recipes have no cover image from their import source. PDF imports always
set `image_url = null` (`lib/pdf-import.ts`), and most URL imports never extract
a usable cover. Previously every image-less recipe fell back to the same generic
chef-hat-on-gradient placeholder, so the library looked monotonous and gave no
visual hint about the kind of recipe.

## Solution

When a recipe has no `image_url`, `RecipeCover` renders a **category
illustration** chosen by `recipe_type` (`kochen` / `backen` / `grillen` /
`zubereiten`). The illustration is rendered full-bleed with `object-cover`,
exactly like a real cover photo, so image-less cards and hero headers match the
layout of recipes that do have a photo.

This is a **display-time fallback only** — no database writes and no migration.
A real `image_url` always takes precedence, and the fallback applies
retroactively to every existing image-less recipe.

### Assets

Four self-contained SVGs live in `public/categories/`, one per `RecipeType`:

| Type         | File             | Motif                     | Mood        |
| ------------ | ---------------- | ------------------------- | ----------- |
| `kochen`     | `kochen.svg`     | steaming pot              | sage green  |
| `backen`     | `backen.svg`     | bread loaf + wheat ear    | warm wheat  |
| `grillen`    | `grillen.svg`    | grill grate + flames      | warm ember  |
| `zubereiten` | `zubereiten.svg` | salad bowl + chef's knife | fresh green |

Each is a 4:3 (`viewBox 0 0 400 300`) line-art illustration on a soft diagonal
gradient, drawn in the app's muted palette so the set is cohesive with the
existing aesthetic. The primary motif is kept inside the central safe zone
(`x:[80,320]`, `y:[90,210]`) so it stays fully visible when the cover is cropped
top/bottom as a wide hero banner.

## Requirements

- `RecipeCover` accepts an optional `recipeType` prop (`RecipeType | null`).
- When `imageUrl` is falsy, render `/categories/{recipeType}.svg` full-bleed;
  default to `kochen` when the type is missing/null.
- The illustration is decorative (`alt=""`, `aria-hidden="true"`) because the
  title is always rendered next to the cover.
- All four cover call sites pass `recipe.recipe_type`: recipe list card
  (`RecipeList.tsx`), detail hero, public share, and library share.

## Acceptance Criteria

- [x] A PDF-imported recipe (no image) shows its category illustration on both
      the list card and the detail hero.
- [x] Each of the four recipe types maps to its own illustration.
- [x] A recipe with a real `image_url` still shows the photo (no illustration).
- [x] The hero crop keeps the motif fully visible.
- [x] No schema or migration changes.

## Out of scope

- PDF export (`RecipePdfDocument`) and the offline view continue to omit the
  cover when no `image_url` exists; they are unchanged by this feature.
