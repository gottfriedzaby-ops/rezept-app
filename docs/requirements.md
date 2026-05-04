# Requirements: Rezept-App

**Status:** In Review
**Author:** Requirements Engineer
**Date:** 2026-05-04
**Version:** 1.0

## 1. Overview

The Rezept-App is a personal recipe manager that imports recipes from heterogeneous sources (websites, YouTube videos, photos, Instagram posts) using the Claude API to extract, normalise, and quality-check the content before persisting it to a Supabase PostgreSQL database. The application targets German-speaking home cooks and presents all UI text in German while keeping internal code, variables, and stored canonical tags in English/German per the project's code convention.

The product goals are:
- Eliminate manual recipe data entry by extracting structured recipes from any source.
- Provide a clean, distraction-free reading and cooking experience (including a step-by-step cook mode with timers).
- Maintain a clean, deduplicated personal recipe library with reliable provenance (source is always recorded).

This document is the project-wide functional requirements overview. Per-feature requirement documents already exist under `/docs/requirements/` (recipe type, multi-image import, multi-section recipes, PDF export, auth & sharing, Cookidoo export, shopping list, nutrition calculation) and remain authoritative for those specific features.

## 2. Business Requirements

- **BR-01** The app must reduce the friction of capturing recipes the user encounters in everyday life (browsing, watching, photographing) to near-zero manual effort.
- **BR-02** Every saved recipe must carry an attributable source. Provenance is non-negotiable: a recipe without a source cannot exist in the system.
- **BR-03** The user-facing experience must be in German. Imports from non-German sources must be normalised to German home-kitchen vocabulary on the way in.
- **BR-04** The library must remain deduplicated as it grows. The same recipe imported via different routes (URL variants, scraped vs. typed) must be detectable.
- **BR-05** The cooking experience must be usable hands-free in a kitchen environment (visible step focus, audible timer cues, screen-on while cooking).
- **BR-06** Phase 2 introduces multi-user authentication, enabling shared access patterns (read-only collection sharing) without compromising single-user simplicity.
- **BR-07** The product is deployed on Vercel and must operate within the runtime, request-size, and execution-time limits of that platform.

## 3. Functional Requirements

### 3.1 Recipe Import — Common Pipeline

- **FR-01** The system must accept import requests from at least four source types: `url`, `youtube`, `photo`, `instagram`. A `manual` source type must also be supported for recipes the user types directly. For manual entries, `source_value` must be set to the literal string `manual` by default (satisfying BR-02 without requiring the user to supply a custom provenance string).
- **FR-02** The import pipeline must execute in this order: (1) fetch raw content, (2) Claude parse pass producing a structured `ParsedRecipe`, (3) Claude review pass that verifies completeness, ingredient realism, step ordering, and German language consistency, (4) duplicate check, (5) user review form, (6) persistence on confirm.
- **FR-03** Every successfully imported recipe must be persisted with: title, ingredients (JSONB, per-serving amounts), steps (JSONB, with optional `timerSeconds`), tags, source type, source value, optional source title, optional cover image URL, recipe type, servings, prep time, cook time, and a scalable flag.
- **FR-04** The Claude review pass must not be allowed to overwrite ground-truth ingredient amounts that were extracted from structured source data (e.g. JSON-LD or parenthetical metric amounts). A code-side guard must restore those amounts after the review pass.
- **FR-05** The user must be presented with an editable review form before any recipe is saved. Ingredient amounts must be displayed as totals for the current serving count and divided back to per-serving on save.
- **FR-06** The confirm endpoint must run a final duplicate check immediately before insertion (defence against race conditions and edits made during review).
- **FR-07** Each import must be testable in isolation; the system must return `{ data, error }` from API routes per the project convention.

### 3.2 Recipe Import — URL Source

- **FR-10** The URL importer must fetch the target page using a Googlebot user agent and consume the full HTML.
- **FR-11** When present, JSON-LD `Recipe` structured data must take priority over free-text parsing.
- **FR-12** The importer must also extract Contentful rich-text attributes and parenthetical metric amounts (e.g. `4½ cups (500 grams)`) and pass these as ground-truth amounts to the Claude parse prompt.
- **FR-13** Cover image extraction priority must be: JSON-LD image → `og:image` → `twitter:image` → largest `<img>` on the page.
- **FR-14** Step images, when discoverable on the source page, must be associated with their respective steps.

### 3.3 Recipe Import — YouTube Source

- **FR-20** The YouTube importer must accept a video URL and retrieve transcript, video description, and channel metadata via the YouTube Data API v3.
- **FR-21** The video thumbnail must be used as the recipe cover image.
- **FR-22** Imports must fail gracefully with an actionable error message when no transcript is available.

### 3.4 Recipe Import — Photo Source

- **FR-30** The photo importer must accept JPEG, PNG, WEBP, and HEIC images.
- **FR-31** HEIC images must be converted to a Claude-compatible format server-side before being sent to the vision API.
- **FR-32** The original (or converted) photo must be uploaded to a public Supabase Storage bucket (`recipe-images`) and the resulting URL stored as the recipe's cover image.
- **FR-33** Multi-image import (carousel-style) must be supported per the existing per-feature requirement `02-multi-image-import.md`.

### 3.5 Recipe Import — Instagram Source

- **FR-40** The Instagram importer must accept an Instagram post URL and produce a `ParsedRecipe` following the same pipeline contract as other sources.

### 3.6 Tag Normalisation

- **FR-50** All tags must be normalised to lowercase German via a synonym map (e.g. `vegetarian` → `vegetarisch`, `Italian` → `italienisch`).
- **FR-51** Tag arrays must be deduplicated after normalisation.
- **FR-52** A one-time admin endpoint to re-normalise all existing tags must exist and must be removable after migration.

### 3.7 Duplicate Detection

- **FR-60** Before saving, the system must check for duplicates using three strategies in order: (a) exact `source_value` match, (b) normalised URL match (UTM parameters and trailing slashes stripped), (c) fuzzy title similarity using Jaccard similarity ≥ 0.85.
- **FR-61** When a duplicate is detected, the user must be informed and given the option to view the existing recipe rather than creating a new one.

### 3.8 Recipe List

- **FR-70** The recipe list page must support full-text search (German) over title, description, and tags using the database's `search_vector` GIN index.
- **FR-71** The recipe list must support tag-based filtering on the client without page reload.
- **FR-72** Each list entry must show a cover image (or a tag-based pastel gradient fallback when no image exists).
- **FR-73** Recipes must be sortable by `created_at` (descending by default).
- **FR-74** Favourite recipes must be visually distinguishable.

### 3.9 Recipe Detail

- **FR-80** The detail page must display ingredients, steps, source, tags, prep/cook times, and cover image.
- **FR-81** A serving counter on the detail page must dynamically scale all ingredient amounts.
- **FR-82** Recipes flagged as non-scalable must lock the serving counter at the original yield.
- **FR-83** Multi-section recipes (e.g. "Für die Soße" + "Für den Teig") must render their sections with separate ingredient and step lists, per `03-multi-section-recipes.md`.
- **FR-84** A user must be able to mark/unmark a recipe as a favourite.
- **FR-85** A user must be able to edit any recipe field after creation.
- **FR-86** A user must be able to delete a recipe (with confirmation).
- **FR-87** A user must be able to export a recipe as PDF (per `04-pdf-export.md`).
- **FR-88** Recipe cards/details must adapt labels and CTAs based on `recipe_type` (Kochen / Backen / Grillen / Zubereiten), per `01-recipe-type.md`.

### 3.10 Cook Mode

- **FR-90** Cook mode must present steps one at a time with a clear focus on the current step.
- **FR-91** Steps with a `timerSeconds` value must show a countdown timer.
- **FR-92** When a timer reaches zero, the system must play an audible beep.
- **FR-93** Cook mode must hold the screen wake lock to prevent the device from sleeping while cooking.
- **FR-94** The user must be able to navigate forwards and backwards between steps.

### 3.11 Authentication (implemented; previously listed as Phase 2)

- **FR-100** The system must support email-based authentication via Supabase Auth, including registration, login, password reset, and email confirmation callback.
- **FR-101** A middleware must enforce authentication on protected routes and refresh sessions on each request.
- **FR-102** Per `05-auth-and-sharing.md`, additional providers (Google, Apple) and read-only sharing of recipe collections must be supported.

### 3.12 Sharing

- **FR-110** The system must support generating shareable, read-only links to a recipe or collection via tokenised public URLs (`/shared/[token]`).
- **FR-111** Share tokens must be revocable by the owning user. Tokens do not expire automatically; they remain valid until explicitly revoked.

### 3.13 User Settings

- **FR-120** A settings page must allow the user to manage account-level preferences and perform account actions (e.g. sign out, delete account).

### 3.14 Planned Features (per existing per-feature docs)

- **FR-130** Cookidoo / Thermomix export per `06-cookidoo-export.md` (v1: schema.org JSON-LD).
- **FR-131** Persistent shopping list with scaled ingredient aggregation per `07-shopping-list.md`.
- **FR-132** Per-serving nutrition calculation (kcal and macros) on import per `08-nutrition-calculation.md`.
- **FR-133** Each authenticated user must be limited to 20 import operations per calendar day (UTC). The limit applies across all import source types (`url`, `youtube`, `photo`, `instagram`). When the cap is reached, the import API must return a user-actionable error message. The counter resets at midnight UTC.

## 4. Non-Functional Requirements

- **NFR-01** All UI text must be in German. Code identifiers, comments, and stored canonical values that are not user-facing strings remain in English.
- **NFR-02** TypeScript strict mode is mandatory. The use of `any` is prohibited in new code.
- **NFR-03** All API routes must conform to the `{ data, error }` response contract.
- **NFR-04** All external API calls (Claude, YouTube, Supabase, scraping fetches) must be wrapped in `try/catch` and surface user-actionable error messages.
- **NFR-05** The Claude model must be `claude-sonnet-4-6` for both the parse and review passes.
- **NFR-06** The application must operate within Vercel's serverless function limits (request body size, execution timeout). Long-running imports must use the `import_jobs` queue table with status transitions `pending → processing → done | error`.
- **NFR-07** Cover images and step images must be served from Supabase Storage with public read access for the `recipe-images` bucket.
- **NFR-08** Full-text search must use PostgreSQL's German text search configuration (`to_tsvector('german', …)`).
- **NFR-09** The cook mode must remain usable on touch devices held in landscape orientation at typical kitchen viewing distances.
- **NFR-10** The serving-scale conversion must always store amounts per serving in the database to keep arithmetic deterministic.

## 5. User Stories

- **US-01** *As a home cook, I want to paste a recipe website URL and get a structured recipe in seconds, so I don't have to copy ingredients by hand.*
  Acceptance: pasting a recognised recipe URL completes import within the page's progress UI and produces an editable review form populated with title, ingredients, and steps.

- **US-02** *As a home cook, I want to import a recipe from a YouTube cooking video, so I can save recipes I discovered while watching.*
  Acceptance: pasting a YouTube URL with a transcript produces a populated review form including the video thumbnail as the cover image.

- **US-03** *As a home cook, I want to photograph a recipe in a cookbook and have it digitised, so my analogue recipes become searchable.*
  Acceptance: uploading a JPEG/PNG/WEBP/HEIC photo of a recipe produces a populated review form; the photo itself becomes the cover image.

- **US-04** *As a home cook, I want to confirm and correct what the AI extracted before saving, so errors don't end up in my library.*
  Acceptance: a review form is shown for every import, ingredient amounts shown as totals for the current servings, and edits on the form are persisted on save.

- **US-05** *As a home cook, I want to be warned before I save a recipe I already have, so my library stays clean.*
  Acceptance: when a duplicate is detected (exact source / normalised URL / fuzzy title), the user sees a warning and a link to the existing recipe.

- **US-06** *As a home cook scaling a recipe for a different number of guests, I want the ingredient amounts to update live, so I don't do mental arithmetic.*
  Acceptance: changing the serving counter on the detail page updates all ingredient amounts; non-scalable recipes lock the counter.

- **US-07** *As a home cook, I want a hands-free cook mode with timers, so I can cook without touching my phone with messy hands.*
  Acceptance: cook mode shows one step at a time, plays a beep when timers complete, and keeps the screen awake.

- **US-08** *As a user, I want to filter and search my library quickly, so I can find a recipe I cooked months ago.*
  Acceptance: the recipe list supports tag filtering and full-text search without a page reload.

- **US-09** *As a user, I want to share a read-only link to a recipe with a friend, so they can view it without an account.*
  Acceptance: a token-based public URL renders the recipe in read-only mode and is revocable.

## 6. Out of Scope

- Multilingual UI. The application is German-only at present. Multilingual support is explicitly deferred.
- Meal planning / weekly menu features.
- Mobile native apps. The product is a responsive web app deployed on Vercel.
- Collaborative real-time editing of recipes between multiple users.
- Public recipe marketplace, social feed, or comments / ratings.
- Inventory / pantry tracking. (Shopping list, separately, is in scope per `07-shopping-list.md`.)
- Voice input / voice-controlled cook mode.
- Offline mode and local caching beyond what the browser does by default.

## 7. Open Questions & Decisions Needed

The following items need stakeholder input to be fully specified. They are listed here as a backlog; per-feature documents under `/docs/requirements/` carry their own per-feature open questions.

- **OQ-01** ~~Should the `manual` source type require a free-text "Quelle" string (e.g. "Oma's Kochbuch") to satisfy BR-02, or is the literal string `manual` acceptable as a placeholder?~~ **Resolved:** The literal string `manual` is acceptable and is set automatically. See FR-01.
- **OQ-02** ~~Should the duplicate-check Jaccard threshold of 0.85 be user-configurable or a fixed system constant?~~ **Resolved:** Fixed system constant at 0.85. No configuration needed.
- **OQ-03** When a YouTube transcript is unavailable, should the system attempt to import using the description and channel metadata only, or hard-fail and ask the user to switch sources?
- **OQ-04** ~~For multi-user mode, should every existing recipe be migrated to a single owner account, or should an admin assignment step be required?~~ **Resolved:** All pre-auth recipes will be deleted when multi-user mode rolls out. Every user starts with a clean database.
- **OQ-05** ~~Should shareable links expire by default, or only when the owner revokes them?~~ **Resolved:** Tokens are permanent until manually revoked by the owner. See FR-111.
- **OQ-06** ~~Is there a per-user import quota, or is rate limiting purely platform-driven (Vercel + Anthropic)?~~ **Resolved:** A per-user daily import cap of 20 recipes must be enforced at the application layer. See FR-133.
- **OQ-07** ~~The CLAUDE.md file currently states authentication is "not yet implemented" but the codebase contains login, register, password-reset, auth callback, and middleware session handling.~~ **Resolved:** Authentication is fully implemented. CLAUDE.md updated.

## 8. Glossary

| Term | Definition |
|---|---|
| **Parse pass** | First Claude call that converts raw source content into structured `ParsedRecipe` JSON. |
| **Review pass** | Second Claude call that quality-checks the parsed recipe for completeness, realistic amounts, step order, and German language consistency. |
| **Ground-truth amounts** | Ingredient amounts extracted from structured data (JSON-LD, parenthetical metric notation) that the review pass is forbidden from overwriting. |
| **ParsedRecipe** | The TypeScript interface representing the AI output before persistence (see `types/recipe.ts`). |
| **Cook mode** | The full-screen, step-by-step, hands-free cooking view at `/(recipes)/[id]/cook`. |
| **Section** | A named subgroup within a recipe (e.g. "Für die Soße") with its own ingredients and steps. |
| **Scalable** | A boolean flag indicating whether ingredient amounts may be linearly scaled with the serving count. |
| **Source value** | The opaque identifier of where the recipe came from: a URL, a YouTube ID, a Supabase Storage path, an Instagram URL, or the literal `manual`. |
| **Recipe type** | Kochen / Backen / Grillen / Zubereiten — drives label and CTA wording per `01-recipe-type.md`. |
| **Tag normalisation** | Mapping of synonym/foreign-language tags to canonical lowercase German tags via a synonym map. |
| **Import job** | A row in the `import_jobs` table tracking the status of an asynchronous import (`pending | processing | done | error`). |
