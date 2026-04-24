# Rezept-App

A personal recipe manager that imports recipes from any source — websites, YouTube videos, or photos — using Claude AI to extract, structure, and quality-check the content before saving.

Built with Next.js 14, Supabase, and the Anthropic Claude API. Deployed on Vercel.

---

## Features

- **Import from URL** — paste any recipe website link; the app scrapes the page, extracts the recipe text, and parses it into structured data
- **Import from YouTube** — paste a video link; the app fetches the transcript, description, and channel metadata and derives the recipe
- **Import from photo** — upload a JPEG, PNG, WEBP, or HEIC image of a handwritten or printed recipe; Claude reads the text via vision
- **AI review pass** — every imported recipe goes through a second Claude call that checks ingredient completeness, realistic amounts, step order, units, and German language consistency
- **Review before saving** — a pre-save form lets you correct the parsed data; ingredient amounts are shown as totals (e.g. for 4 servings) and divided back to per-serving on save
- **Cover images** — extracted from og:image for URLs, YouTube thumbnails for videos, and uploaded to Supabase Storage for photos; tag-based gradient fallbacks when no image is available
- **Tag normalisation** — a synonym map canonicalises tags to lowercase German (e.g. "vegetarian" → "vegetarisch", "Italian" → "italienisch") and deduplicates
- **Duplicate detection** — checks exact source match, normalised URL match (strips UTM params, trailing slashes), and fuzzy title similarity (Jaccard ≥ 85%) before allowing a save
- **Scaling** — recipe detail page scales all ingredient amounts dynamically by serving count
- **Cook mode** — step-by-step cooking view with per-step countdown timers, an audio beep on completion, and screen wake lock
- **Search and tag filtering** — client-side filtering on the recipe list; no page reload required

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | Supabase (PostgreSQL) |
| File storage | Supabase Storage |
| AI | Claude API via `@anthropic-ai/sdk` — model `claude-sonnet-4-6` |
| Styling | Tailwind CSS with a custom Scandinavian minimal design system |
| Fonts | Fraunces (serif headings) + Inter (body) via `next/font/google` |
| Deployment | Vercel |

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/gottfriedzaby-ops/rezept-app.git
cd rezept-app
npm install
```

### 2. Set up Supabase

Create a project at [supabase.com](https://supabase.com), then run the schema in the SQL editor:

```bash
# Copy the contents of schema.sql and run them in Supabase → SQL Editor → New query
```

Create a storage bucket named `recipe-images` with **public access** enabled.

### 3. Environment variables

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-api-key
YOUTUBE_API_KEY=your-youtube-data-api-v3-key
```

The YouTube API key is only needed for YouTube imports. Get one from [Google Cloud Console](https://console.cloud.google.com/) with the YouTube Data API v3 enabled.

### 4. Run locally

```bash
npm run dev   # starts on http://localhost:3000
```

---

## Project structure

```
app/
  (recipes)/
    page.tsx              # Recipe list (server component)
    [id]/page.tsx         # Recipe detail
    [id]/cook/page.tsx    # Cook mode
  api/
    import-url/           # Website import
    import-youtube/       # YouTube import
    import-photo/         # Photo import (HEIC conversion, Supabase Storage upload)
    recipes/confirm/      # Save after review; final duplicate check
    admin/normalize-tags/ # One-time migration — delete after use

components/
  ImportUnified.tsx       # Smart import input with auto-detection
  ImportProgress.tsx      # Animated multi-step loading indicator
  RecipeReviewForm.tsx    # Pre-save editing form
  RecipeDetail.tsx        # Ingredient scaling + cook-mode link
  RecipeList.tsx          # Search + tag filter UI
  RecipeCover.tsx         # Cover image with gradient fallback
  CookMode.tsx            # Step-by-step cooking view with timers

lib/
  claude.ts               # Claude API wrappers (parse + review)
  supabase.ts             # Supabase client (anon + service role)
  tags.ts                 # Tag normalisation and synonym map
  duplicate-check.ts      # Three-layer duplicate detection
  tag-colors.ts           # Keyword → pastel colour mapping

types/
  recipe.ts               # Recipe, ParsedRecipe, Ingredient, Step types
```

---

## Import pipeline

```
User input (URL / video / photo)
        │
        ▼
  Fetch raw content
  (scrape HTML / YouTube transcript / base64 image)
        │
        ▼
  Claude call 1 — parse
  Returns structured ParsedRecipe JSON
        │
        ▼
  Claude call 2 — review
  Checks completeness, amounts, units, German language, tags
        │
        ▼
  Duplicate check
  (exact URL · normalised URL · fuzzy title)
        │
        ▼
  Review form shown to user
  (amounts displayed as totals; user can edit)
        │
        ▼
  confirm endpoint — save to Supabase
  (amounts divided back to per-serving before insert)
```

---

## Data model

Recipes are stored in a single `recipes` table. Ingredients and steps are JSONB columns. Amounts are stored **per serving** — the detail page multiplies by the current serving count for display.

See `schema.sql` for the full schema including indexes and the `updated_at` trigger.

---

## Scripts

```bash
npm run dev      # local dev server (port 3000)
npm run build    # production build
npm run lint     # ESLint
```
