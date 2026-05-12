# Frontend Improvements — Requirements Documentation

## Overview

Ten prioritised improvements for the Rezept-App frontend. All are self-contained UI/UX changes that require **no database migrations**. Ordered by effort (S → M) and then by impact.

---

## REQ-001 · Keyboard Navigation in Cook Mode

| Field | Value |
|---|---|
| Priority | High |
| Effort | S |
| Component | `components/CookMode.tsx` |
| Schema change | No |

### Problem
During active cooking, users' hands are often wet or dirty. Advancing a step requires tapping the "Weiter" button — there is no keyboard or hands-free alternative.

### Requirements
- Pressing `ArrowRight` or `Space` advances to the next step.
- Pressing `ArrowLeft` goes to the previous step.
- Pressing `t` toggles the timer (start/pause).
- The listener must be registered and cleaned up inside a `useEffect`, following the same pattern as the existing wake-lock effect.
- Nav buttons and the timer button must expose `aria-keyshortcuts` attributes for screen-reader discoverability.

### Acceptance Criteria
- [x] Arrow keys and Space navigate steps without clicking.
- [x] `t` starts and pauses the timer.
- [x] No key events fire when a modal or input within the page has focus.
- [x] Listener is removed on component unmount.

---

## REQ-002 · Sticky Progress Bar in Cook Mode

| Field | Value |
|---|---|
| Priority | Medium |
| Effort | S |
| Component | `components/CookMode.tsx` |
| Schema change | No |

### Problem
Cook Mode shows only a fraction like "2 / 7" in the header. Users have no visual sense of progress through a long recipe, especially when the header scrolls out of view.

### Requirements
- A thin horizontal bar (height `4px`) is placed directly below the `<header>` element.
- The filled portion's width equals `(stepIndex + 1) / steps.length * 100%`.
- Fill colour is the forest-green accent (`bg-forest`); unfilled track uses the stone/neutral colour (`bg-stone`).
- Width transition is animated: `transition-[width] duration-300 ease-out`.
- The bar is always visible (not scrollable away) — it must be `position: sticky` or part of the fixed header area.

### Acceptance Criteria
- [x] Bar is visible at all times during Cook Mode.
- [x] Width increases smoothly on each step advance.
- [x] Reaches 100% on the last step.
- [x] No layout shift introduced.

---

## REQ-003 · Empty-State Illustration on Recipe List

| Field | Value |
|---|---|
| Priority | Medium |
| Effort | S |
| Component | `components/RecipeList.tsx` |
| Schema change | No |

### Problem
When a filter or search returns no results, only plain text "Keine Rezepte gefunden." is displayed — no visual cue and no action to help the user recover.

### Requirements
- Replace the plain `<p>` with a centred empty-state block containing:
  - A small inline SVG illustration (e.g., open cookbook or chef's hat) using forest palette colours.
  - A headline: **"Nichts gefunden"**.
  - A ghost button labelled **"Filter zurücksetzen"** that clears `query` and `activeTags`.
- The empty state must not appear when the list has recipes that simply aren't loaded yet (loading state is handled separately).

### Acceptance Criteria
- [x] Empty-state block is shown when `filtered.length === 0` and at least one filter is active.
- [x] "Filter zurücksetzen" clears all active filters and restores the full list.
- [x] Illustration uses the project colour palette (forest green, cream).
- [x] Zero-recipe state on first load (no filters) retains the existing import-nudge copy.

---

## REQ-004 · Ingredient Checklist in Cook Mode

| Field | Value |
|---|---|
| Priority | Medium |
| Effort | S |
| Component | `components/CookMode.tsx` |
| Schema change | No |

### Problem
The collapsible ingredient drawer in Cook Mode is purely read-only. Users cannot track which ingredients they have already added, forcing repeated re-reading of the full list.

### Requirements
- Each ingredient row in the drawer becomes a toggle button.
- Tapping an ingredient marks it "done": text receives `line-through text-ink-tertiary` styling and a small checkmark icon (forest green) appears.
- Tapping again un-marks it.
- Checked state is held in a `Set<number>` (keyed by ingredient index) via `useState`.
- State resets when the Cook Mode component unmounts — no persistence to the database required.
- The existing `formatAmount()` helper must be reused unchanged.

### Acceptance Criteria
- [x] Tapping an ingredient toggles its checked appearance.
- [x] Visual distinction between checked and unchecked is clear.
- [x] Checking does not affect ingredient amounts.
- [x] State is not preserved across Cook Mode sessions (by design).

---

## REQ-005 · Scroll-to-Top + Step Images in Cook Mode

| Field | Value |
|---|---|
| Priority | Medium |
| Effort | S |
| Component | `components/CookMode.tsx` |
| Schema change | No |

### Problem
1. After scrolling down within a long step and tapping "Weiter", the user lands mid-scroll in the next step with no indication that more content may be above.
2. `recipe.step_images` is defined in the `Recipe` type and displayed in `RecipeDetail`, but Cook Mode never shows step images — discarding a useful visual cue.

### Requirements
- On every step change, `<main>` scrolls to the top immediately (`behavior: "instant"`, not smooth, to avoid disorientation).
- The scroll is triggered via `useRef` on `<main>`, not via `window.scrollTo`.
- If a matching entry exists in `recipe.step_images` for the current step order, it is displayed below the step text as a full-width image with rounded corners.
- The image should be responsive and not break the layout on small screens.

### Acceptance Criteria
- [x] Advancing a step always resets the scroll position to the top.
- [x] A step image is displayed when `recipe.step_images[stepIndex]` is defined.
- [x] No image placeholder is shown when no step image exists.
- [x] Scroll reset does not trigger layout shift.

---

## REQ-006 · Expanded Search (Ingredients + Tags)

| Field | Value |
|---|---|
| Priority | High |
| Effort | S |
| Component | `components/RecipeList.tsx` |
| Schema change | No |

### Problem
The search filter matches only `recipe.title`. Searching for "Knoblauch" or "vegetarisch" returns no results even though these terms appear in ingredient lists and tags.

### Requirements
- `matchesQuery` inside the `filtered` `useMemo` is extended to also match:
  - `r.tags.some(t => t.toLowerCase().includes(q))`
  - `r.ingredients.some(i => i.name.toLowerCase().includes(q))`
- The change is purely client-side; no additional Supabase query is needed.
- Search remains case-insensitive.

### Acceptance Criteria
- [x] Searching a tag name (e.g., "vegetarisch") returns recipes with that tag.
- [x] Searching an ingredient name (e.g., "Knoblauch") returns recipes containing that ingredient.
- [x] Title search still works as before.
- [x] Performance is not noticeably degraded for up to ~200 recipes.

---

## REQ-007 · Sort Control for Recipe List

| Field | Value |
|---|---|
| Priority | Low |
| Effort | S |
| Component | `components/RecipeList.tsx` |
| Schema change | No |

### Problem
Recipes are always displayed newest-first (fixed server-side ordering). With a growing collection there is no way to sort alphabetically or by total cooking time.

### Requirements
- A sort control (compact `<select>` or segmented button group) is added next to the search input.
- Sort options:
  - **Neueste zuerst** (default, `created_at DESC`)
  - **A–Z** (alphabetical by title)
  - **Kochzeit** (ascending `prep_time + cook_time`)
- Sorting is applied as a final `.sort()` on the `filtered` array inside the existing `useMemo`.
- The control uses the `.input-field` CSS class from `globals.css` for visual consistency.
- Sort preference is stored in `useState`; it does not need to be persisted in the URL (that is covered by REQ-010).

### Acceptance Criteria
- [x] All three sort options produce the correct order.
- [x] Sort is applied after filtering (not before).
- [x] Default is newest-first on page load.
- [x] Visual style matches existing filter controls.

---

## REQ-008 · `next/image` for Recipe Covers

| Field | Value |
|---|---|
| Priority | Medium |
| Effort | M |
| Components | `components/RecipeCover.tsx`, `next.config.js` |
| Schema change | No |

### Problem
`RecipeCover.tsx` uses a plain `<img>` tag with no width/height, no `srcSet`, and no placeholder. This causes cumulative layout shift (CLS) on the list page and full-resolution downloads on mobile viewports.

### Requirements
- Replace both `<img>` elements in `RecipeCover.tsx` with `<Image>` from `next/image`.
- **Card variant:** use `fill` layout with `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"`.
- **Hero variant:** use explicit `width={1200} height={420}`.
- Both variants use `placeholder="blur"` with a small `blurDataURL` derived from the dominant gradient produced by `getRecipeGradient()` in `lib/tag-colors.ts`.
- The Supabase Storage hostname must be added to `images.remotePatterns` in `next.config.js`.
- `priority` prop is set to `true` on the hero variant to enable LCP preloading.

### Acceptance Criteria
- [x] No plain `<img>` remains in `RecipeCover.tsx`.
- [x] DevTools Network tab shows `srcSet` / WebP variants being served.
- [x] No CLS on the recipe list page (Lighthouse CLS = 0).
- [x] Blur placeholder is visible while the image loads.
- [x] `npm run build` produces no `next/image` warnings.

---

## REQ-009 · Inline Tag Editor with Colour Preview

| Field | Value |
|---|---|
| Priority | Medium |
| Effort | M |
| Components | `components/TagInput.tsx` (new), `components/RecipeReviewForm.tsx`, `components/RecipeEditForm.tsx` |
| Utilities | `lib/tag-colors.ts` → `getTagColor()`, `lib/tags.ts` → tag synonym keys |
| Schema change | No |

### Problem
Tags in `RecipeReviewForm` and `RecipeEditForm` are entered as a raw comma-separated string. Users must know the exact canonical spelling for `getTagColor()` to match; there is no preview of the tag colour before saving.

### Requirements
- Create a new shared `TagInput` component:
  - Renders existing tags as coloured pills using `getTagColor()`.
  - Each pill has an `×` button to remove it.
  - A text input allows typing a new tag with autocomplete suggestions drawn from the known tag keys in `lib/tag-colors.ts`.
  - The colour of a newly typed tag is previewed live next to the input before it is added.
- Replace the `tagsInput` string state in `RecipeReviewForm` and `RecipeEditForm` with an array-based state and the new `TagInput` component.
- `normalizeTags()` from `lib/tags.ts` must be applied when tags are submitted.

### Acceptance Criteria
- [x] Existing tags render as coloured pills in both forms.
- [x] A tag can be removed individually without clearing all tags.
- [x] Autocomplete suggests known tags as the user types.
- [x] Tag colour preview is visible before confirming a new tag.
- [x] Saved tags are identical in format to the current implementation (lowercase, normalised).

---

## REQ-010 · Persist Filter State in the URL

| Field | Value |
|---|---|
| Priority | High |
| Effort | M |
| Components | `components/RecipeList.tsx`, `app/(recipes)/page.tsx` |
| Schema change | No |

### Problem
Filter state (search query, active tags, favourites toggle) is held in React `useState`. Navigating to a recipe detail page and pressing the browser Back button resets all filters. There is no way to bookmark or share a filtered view.

### Requirements
- Replace the three `useState` calls for `query`, `activeTags`, and `showFavoritesOnly` in `RecipeList.tsx` with reads from `useSearchParams()`.
- Write back to the URL using `router.replace()` from `next/navigation` on every filter change (no page reload).
- URL encoding:
  - Search query: `?q=knoblauch`
  - Active tags: repeated params `?tag=vegetarisch&tag=schnell`
  - Favourites: `?fav=1` (omitted when false)
- Wrap `<RecipeList>` in `app/(recipes)/page.tsx` with `<Suspense fallback={null}>` to satisfy the App Router requirement for `useSearchParams()`.
- Sort preference from REQ-007 may optionally be included as `?sort=az`.

### Acceptance Criteria
- [x] URL reflects active filters in real time.
- [x] Navigating to a recipe and pressing Back restores the previous filter state.
- [x] A URL with filter params can be opened in a new tab and shows the correct filtered view.
- [x] Clearing all filters removes the query params from the URL.
- [x] `npm run build` has no hydration warnings related to `useSearchParams`.

---

## Implementation Notes

- All 10 items require zero database migrations.
- Items REQ-001 through REQ-007 are **S** effort — single-file changes with no new dependencies.
- Items REQ-008, REQ-009, REQ-010 are **M** effort — they introduce new patterns (`next/image` domain config, a shared component, URL-bound state) but remain fully self-contained.
- REQ-009 is the only item that creates a new component file (`TagInput.tsx`).
- Implement in dependency order: REQ-006 and REQ-007 before REQ-010 (so sort state can be included in the URL encoding from the start).
