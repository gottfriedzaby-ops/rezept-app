# Feature 14 — Equal-Height Recipe Tiles in the Library Grid

**Pro Zeile gleich hohe Rezeptkacheln in `/` (Bibliotheksansicht), erreicht durch reservierte Höhen für optionale UI-Elemente**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **S** (1–3 days) |
| Priority | Low (visual polish) |
| Dependencies | None — purely a CSS / component-layout change in `components/RecipeList.tsx` |

---

## 1. Overview

The recipe library at `/` renders recipes in a responsive CSS Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6` (see `components/RecipeList.tsx`, approx. lines 311–395). Each tile contains:

1. Cover image
2. Title (currently `line-clamp-2`)
3. A tag row (conditionally rendered if the recipe has tags)
4. A metadata row showing prep/cook time and servings (conditionally rendered if either value is present)

Because the tag row and the metadata row are **conditionally rendered**, recipes with no tags and no time information produce visibly shorter tiles than fully-populated recipes in the same grid row. The result is uneven row heights that make the library look ragged.

This feature standardises tile heights so that **every tile in a given grid row is the same height**, achieved by reserving the height of optional rows even when they have no content. Mobile (single-column) layout is unaffected; equal-height behavior applies at the `sm` breakpoint and above.

**Goal:** A library grid where every row's tiles align flush at the bottom edge, without changing any data, any conditional logic about what is shown, or the mobile layout.

---

## 2. Business Requirements

| ID | Requirement |
|----|-------------|
| BR-14-1 | The recipe library must look visually consistent: tiles in the same row align at the bottom. |
| BR-14-2 | The change must be purely cosmetic — no data, no labels, no behavior changes. |
| BR-14-3 | Recipes with no tags or no time/servings information must still appear in the library with no UI degradation other than uniform height. |
| BR-14-4 | Mobile users (single-column) must not see any change. |

---

## 3. Functional Requirements

### Title behavior

| ID | Requirement |
|----|-------------|
| FR-14-1 | The title element keeps its existing `line-clamp-2` (max 2 lines, ellipsis when overflowing). |
| FR-14-2 | The title element has a reserved vertical space equal to the height of two lines of its computed font-size — i.e. a `min-height` matching two lines of the title's leading. Single-line titles pad to this height, never collapse. |
| FR-14-3 | When the title is truncated by `line-clamp-2`, a native `title` HTML attribute equal to the full untruncated title is set on the title element, so hovering on desktop reveals the full title in a browser tooltip. |
| FR-14-4 | When the title is NOT truncated, no `title` attribute is set (or it is set to an empty string), so no redundant tooltip appears. |

### Tag row

| ID | Requirement |
|----|-------------|
| FR-14-5 | The tag row ALWAYS reserves its vertical space, regardless of whether the recipe has tags. When tags are absent, the space is held by an invisible placeholder. |
| FR-14-6 | The reserved height matches the natural height of a single row of tag chips (one line). Multi-line tag rows continue to expand as before; the floor is one row, not zero. |
| FR-14-7 | The placeholder used to reserve space when tags are absent has no visible content, no border, no background — it is structurally present but visually transparent. |

### Metadata row (prep/cook time + servings)

| ID | Requirement |
|----|-------------|
| FR-14-8 | The metadata row ALWAYS reserves its vertical space, regardless of whether `prep_time`, `cook_time`, or `servings` is present. |
| FR-14-9 | Inside the reserved metadata row, the individual icons/labels for time and servings remain conditionally rendered (FR-14-10 covers their visibility). |
| FR-14-10 | When `prep_time` and `cook_time` are both null/zero, no time icon or text is rendered, but the row itself still reserves its height. Same for `servings`. |

### Per-row equal-height behavior

| ID | Requirement |
|----|-------------|
| FR-14-11 | At the `sm` breakpoint and above (i.e. ≥ 640 px viewport width — `grid-cols-2` and `grid-cols-3`), every tile in a given grid row matches the height of the tallest tile in that row. |
| FR-14-12 | The mechanism uses CSS Grid's natural per-row equal-height behavior (default `align-items: stretch` on grid items, combined with `h-full` on the tile's outer container and `flex flex-col` on its inner content). No JavaScript measurement, no `ResizeObserver`, no manual height calculation. |
| FR-14-13 | Below the `sm` breakpoint (single-column mobile), tiles render at their natural height; no padding or `min-height` is enforced beyond what FR-14-2 / FR-14-5 / FR-14-8 already produce. |

### Image and overall card shape

| ID | Requirement |
|----|-------------|
| FR-14-14 | The cover image keeps its existing aspect ratio and dimensions. |
| FR-14-15 | The card's outer container expands vertically to fill the row height; the cover image stays at its natural size at the top; the title, tag row, and metadata row sit below the image; any excess height produced by row-stretching is distributed as flexible space ABOVE the metadata row (e.g. via `flex-grow` on the title or a spacer element), so the metadata row stays anchored to the bottom of the tile. |
| FR-14-16 | The favorite toggle (existing absolute-positioned button on the cover) is unaffected. |
| FR-14-17 | The shared-recipe badge from Feature 11 (top-right corner of the cover, when present) is unaffected. |

### No data or behavior changes

| ID | Requirement |
|----|-------------|
| FR-14-18 | No database query changes. No new fields fetched. |
| FR-14-19 | No changes to `/api/*` routes. |
| FR-14-20 | No changes to recipe sorting, filtering, search, tag cloud, or the recipe-detail page. |
| FR-14-21 | No changes to the shared-library hub `/library-shares/[ownerId]` (even if it reuses the same tile component, applying equal-height there is acceptable but not required as part of this feature — see OQ-14-3). |

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-14-1 | No measurable layout-shift (CLS) regression after the first paint compared to the current implementation. The reserved heights take effect on first render. |
| NFR-14-2 | No additional layout passes or JavaScript on scroll. Pure CSS solution. |
| NFR-14-3 | Tailwind utility classes only; no inline `style={{}}` heights, no custom CSS modules, no `@apply` rules in a new stylesheet. |
| NFR-14-4 | The change is keyboard- and screen-reader-neutral: invisible placeholders MUST NOT be focusable, MUST NOT be announced. Use `aria-hidden="true"` if a placeholder element is necessary. |
| NFR-14-5 | TypeScript strict mode preserved. Component props interfaces unchanged. |
| NFR-14-6 | The visual change works in light mode and dark mode (placeholders inherit transparent background — no color regression in either theme). |
| NFR-14-7 | The change works for both the user's own library and the unified library that includes shared recipes (Feature 11). |
| NFR-14-8 | Jest tests in `__tests__/` continue to pass. New tests are not required for a purely visual change but a snapshot test of the tile structure is welcome. |

---

## 5. User Stories

### US-14-1 — Library looks aligned
> Als Nutzer möchte ich, dass in meiner Rezeptbibliothek alle Kacheln einer Zeile gleich hoch sind, damit die Übersicht ruhig und aufgeräumt wirkt.

**Acceptance criteria:**
- [ ] In a row containing one fully-populated recipe and one recipe with no tags and no time information, both tiles end at the same vertical pixel.
- [ ] Resizing the browser between mobile, tablet, and desktop widths produces no broken layout.
- [ ] Tiles never overlap, never leave large gaps between rows.

### US-14-2 — Long titles still readable
> Als Nutzer möchte ich bei einem zu langen Rezeptnamen den vollen Titel sehen können, ohne die Detailseite zu öffnen.

**Acceptance criteria:**
- [ ] A title of more than 2 lines is visually truncated with an ellipsis (existing `line-clamp-2`).
- [ ] Hovering the truncated title on desktop shows the full title in a browser tooltip.
- [ ] A short, one-line title still pads to the height of a two-line title (consistent layout).

### US-14-3 — Mobile unchanged
> Als Mobilnutzer möchte ich, dass sich an meiner Listenansicht nichts ändert, weil meine Kacheln untereinander stehen und Höhenangleichung dort keine Bedeutung hat.

**Acceptance criteria:**
- [ ] At viewport width < 640 px, tile heights match their natural content height as before — no enforced `min-height` from the per-row equal-height mechanism.
- [ ] The reserved heights for title (FR-14-2), tag row (FR-14-5), and metadata row (FR-14-8) DO still apply on mobile so a tile with no tags is consistent in height with a tile with tags — this is consistent within a tile, not between tiles in a row.

### US-14-4 — Sparse recipe still looks like a recipe
> Als Nutzer möchte ich, dass ein Rezept ohne Tags und ohne Zubereitungszeit nicht "kaputt" aussieht, sondern dieselbe visuelle Struktur wie ein vollständiges Rezept hat.

**Acceptance criteria:**
- [ ] A tile with no tags, no times, and no servings still renders with the same outer dimensions as a fully-populated tile in the same row.
- [ ] No visible empty space artefacts (e.g. stray bottom border, weird padding).

---

## 6. Implementation Hints

### Affected component

`components/RecipeList.tsx`, around lines 311–395. The change is localised to this single component.

### Tailwind utility sketch (non-binding)

```tsx
// Grid container — unchanged
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  {recipes.map(recipe => (
    // Outer tile — h-full lets CSS Grid stretch to row height; flex-col for vertical layout
    <article key={recipe.id} className="h-full flex flex-col rounded-lg ...">

      {/* Cover image — natural height, unchanged */}
      <RecipeCover ... />

      {/* Body — grows to fill remaining height */}
      <div className="flex flex-col flex-1 p-4">

        {/* Title — reserved 2-line height */}
        <h3
          className="line-clamp-2 min-h-[3rem] ..."  // example value; tune to actual font/leading
          title={isTitleLikelyTruncated(recipe.title) ? recipe.title : undefined}
        >
          {recipe.title}
        </h3>

        {/* Tag row — reserved height */}
        <div className="min-h-[1.75rem] mt-2">
          {recipe.tags.length > 0 ? (
            <TagChips tags={recipe.tags} />
          ) : (
            <div aria-hidden="true" />
          )}
        </div>

        {/* Spacer — pushes metadata to bottom */}
        <div className="flex-1" />

        {/* Metadata row — reserved height */}
        <div className="min-h-[1.5rem] mt-2 flex items-center gap-3 text-sm">
          {(recipe.prep_time || recipe.cook_time) && <TimeBadge ... />}
          {recipe.servings && <ServingsBadge ... />}
        </div>
      </div>
    </article>
  ))}
</div>
```

The exact `min-h-*` values must be measured against the current font metrics to avoid clipping. Tailwind's spacing scale (`min-h-12`, etc.) is preferred; arbitrary values (`min-h-[3rem]`) are acceptable when no scale value matches.

### Truncation detection for the `title` attribute

Server-side detection is impossible (depends on rendered font / width). Two acceptable approaches:

- **(a) Always set `title={recipe.title}` unconditionally.** Slightly redundant when titles fit, but harmless. Simplest. Recommended for v1.
- **(b) Detect truncation client-side via a ref + `scrollHeight > clientHeight` check after mount.** Adds complexity for marginal benefit. Not recommended for v1.

Choice between (a) and (b) is an implementation detail; **(a)** is the suggested default.

### CSS Grid stretches by default

`grid-auto-rows` / `align-items` defaults already stretch grid items to fill the row's tallest item — provided the item uses `h-full` (or equivalent). No additional Tailwind config required.

### Mobile carveout

At `grid-cols-1` (default mobile), each "row" contains exactly one tile, so the stretch behavior is a no-op — no special media query needed to opt out on mobile.

---

## 7. Out of Scope

The following are explicitly NOT part of this feature:

- **Equal-width tiles.** Grid columns are already equal-width via `grid-cols-N`; no change.
- **Equal-height across DIFFERENT rows.** Only tiles within the same row are required to match; row-to-row heights remain natural.
- **Changing the number of grid columns at any breakpoint.** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` stays.
- **Adding new metadata (e.g. nutrition kcal, recipe type icon) to the tile.** Out of scope.
- **Changing the cover image's aspect ratio or dimensions.**
- **Changing the favorite-toggle UI, the shared-recipe badge, or any overlay on the cover.**
- **Applying the same layout to the shared-library hub at `/library-shares/[ownerId]`** unless the same component is reused (see OQ-14-3).
- **Applying the same layout to the public read-only share view at `/shared/[token]`** unless the same component is reused.
- **Changing tile sort order or default sort field.**
- **Changing how the tag row collapses on long tag lists** (already addressed in PR #52 "collapse the recipe-list tag bar").
- **JavaScript-based equal-height (ResizeObserver, getBoundingClientRect loops).** Out of scope — CSS-only solution required.
- **CLS / Lighthouse optimization beyond avoiding regression.**
- **Tests beyond an optional snapshot.** Visual regression testing infrastructure is not introduced by this feature.

---

## 8. Open Questions & Decisions Needed

| # | Question | Options | Owner |
|---|---|---|---|
| OQ-14-1 | Truncation detection for the `title` attribute: always set unconditionally, or detect at runtime? | **(a)** Always set `title={recipe.title}`. **(b)** Detect via ref-based scrollHeight check after mount. | Engineering |
| OQ-14-2 | Exact reserved heights for title (FR-14-2), tag row (FR-14-5), metadata row (FR-14-8). Should these be specified in the requirements doc, or left to the implementer to measure against the current font metrics? | **(a)** Implementer measures against current font metrics and chooses. **(b)** Specify exact values here. | Engineering + Design |
| OQ-14-3 | Should the same equal-height behavior also apply to the shared-library hub `/library-shares/[ownerId]` and the public share view `/shared/[token]`? | **(a)** Yes — apply everywhere a recipe-tile grid is rendered. **(b)** No — limit this feature to `/`; hub and share view follow in a separate feature. **(c)** Automatic — if the same component is reused, it inherits the behavior naturally; no scope expansion needed. | Product |
| OQ-14-4 | If a tile is part of a multi-line tag row (e.g. 8 tags wrapping to 2 lines), should the OTHER tiles in the row pad to that 2-line height? | **(a)** Yes (CSS Grid stretch handles this automatically — no extra work). **(b)** No — clip the tag row at 1 line to avoid disproportionate row heights. | Product |
| OQ-14-5 | What is the desired behavior when `image_url` is missing on a recipe (the chef-hat placeholder cover from PR #55)? Same reserved height as a normal image? | **(a)** Yes — placeholder fills the same image area as a real cover (already current behavior post PR #55). **(b)** No — collapse the cover area for placeholders. | Product |

---

## 9. Effort Estimate

**Overall: S** (1–3 days, single full-stack developer).

Breakdown:

| Sub-task | Estimate |
|---|---|
| Measure current font metrics; pick `min-h-*` values for title, tag row, metadata row | 0.25 day |
| Refactor tile JSX in `components/RecipeList.tsx`: `h-full flex flex-col`, reserved-height rows, `flex-1` spacer | 0.5 day |
| Add `title` attribute on the recipe title element per FR-14-3 / FR-14-4 | 0.1 day |
| Manual cross-browser check (Chrome, Safari, Firefox) at mobile/tablet/desktop breakpoints | 0.25 day |
| Manual check in dark mode | 0.1 day |
| Manual check with sparse recipes (no tags, no times) | 0.1 day |
| Optional: snapshot test for the tile structure | 0.25 day |

---

## 10. Glossary

| Term | Definition |
|---|---|
| **Tile** | One recipe card in the library grid at `/`. |
| **Row** | One horizontal line of tiles in the CSS Grid. At `sm` breakpoint there are 2 tiles per row; at `lg` there are 3. |
| **Reserved height** | A `min-height` (or equivalent fixed-height placeholder) that ensures a UI row contributes its vertical space even when it has no content. |
| **Per-row equal-height** | The property that all tiles in a single grid row share the height of the tallest tile in that row. CSS Grid default behavior with `h-full` on grid items. |
| **Line-clamp** | Tailwind utility (`line-clamp-2`) that visually truncates text to N lines and adds an ellipsis. Powered by `-webkit-line-clamp`. |
| **Native tooltip** | The browser's built-in hover tooltip triggered by the HTML `title` attribute. Not styleable, accessible by default. |

---

*Feature 14 of N — see [README.md](./README.md) for full index. This is a frontend-only change with no schema impact, no API changes, and no new dependencies.*
