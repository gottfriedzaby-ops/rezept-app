# Feature 04 — PDF Export for Single Recipes

**Rezept als druckfreundliches PDF exportieren**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **S–M** (1–5 days depending on approach) |
| Priority | Medium |
| Dependencies | None |

---

## 1. Overview

Users want a portable, print-friendly version of a recipe that they can save, print, or share without needing access to the app. A well-formatted PDF is the standard format for this use case.

This feature adds a "PDF exportieren" button to the recipe detail page. Clicking it generates and downloads a PDF containing all relevant recipe information: cover image, title, metadata, ingredients, numbered steps, and source credit.

**Goal:** Allow users to export any recipe as a clean, readable PDF in under 10 seconds, without requiring authentication.

---

## 2. User Stories

### US-04-1 — Export a recipe as PDF
> Als Nutzer möchte ich auf der Rezeptdetailseite auf "PDF exportieren" klicken und ein fertig formatiertes PDF herunterladen, damit ich das Rezept ausdrucken oder offline speichern kann.

**Acceptance criteria:**
- A "PDF exportieren" button is visible on the recipe detail page.
- Clicking the button triggers a download of a PDF file.
- The PDF filename is the slugified recipe title (e.g. `spaghetti-bolognese.pdf`).
- The download starts within 10 seconds.

---

### US-04-2 — PDF contains all relevant recipe information
> Als Nutzer möchte ich, dass das exportierte PDF den Titel, das Bild, die Metadaten (Portionen, Zeit), die Zutaten und die Schritte enthält, damit ich alles Notwendige zum Kochen auf einem Blatt habe.

**Acceptance criteria:**
- PDF includes: cover image (if available), title, tags, prep time, cook time, total time, servings, ingredient list, numbered steps, and source credit.
- Cover image is optional — PDF generates correctly without it.

---

### US-04-3 — Steps do not break across pages
> Als Nutzer möchte ich, dass Rezeptschritte im PDF nicht mitten im Text auf eine neue Seite umbrechen, damit das PDF gut lesbar ist.

**Acceptance criteria:**
- Each step stays on a single page where possible.
- If a step is longer than a full page, it may break — but short steps must not orphan their number on a different page from their text.

---

### US-04-4 — PDF works for multi-section recipes
> Als Nutzer möchte ich, dass auch Rezepte mit mehreren Abschnitten (Feature 03) korrekt im PDF erscheinen, mit Abschnittsüberschriften vor den jeweiligen Zutaten und Schritten.

**Acceptance criteria:**
- If Feature 03 is deployed, section headings appear in the PDF above each section's ingredients and steps.
- If no sections are present, the PDF renders as a standard flat recipe.

---

## 3. Functional Requirements

### FR-04-1 — "PDF exportieren" button
A button labeled **"PDF exportieren"** MUST appear on the recipe detail page. Placement: in the action bar alongside existing "Bearbeiten" and "Löschen" buttons.

### FR-04-2 — PDF content structure
The generated PDF MUST include the following sections in order:

1. **Cover image** (full-width, optional — omitted if `image_url` is null)
2. **Title** (large heading)
3. **Tags** (pill badges or comma-separated)
4. **Metadata row:** Portionen · Vorbereitungszeit · [Kochzeit/Backzeit per Feature 01] · Gesamtzeit
5. **Zutaten** heading + ingredient list (amount, unit, name per line)
6. **Zubereitung** heading + numbered steps
7. **Quelle** credit line at the bottom (source_title + source_value as URL if applicable)

### FR-04-3 — Filename
The downloaded PDF filename MUST be `{slugified-title}.pdf`.
Slugification: lowercase, spaces replaced by hyphens, special characters (umlauts etc.) transliterated.
Example: "Klassische Tomatensoße" → `klassische-tomatensosse.pdf`.

### FR-04-4 — Pagination
Steps MUST NOT break mid-step across pages. The implementation MUST use `page-break-inside: avoid` (CSS) or equivalent library-level page break prevention for step elements.

### FR-04-5 — No authentication required
PDF export MUST work for any user who can view the recipe detail page. No login required. (If authentication is added in Feature 05, PDF export remains accessible to read-only shared users as well.)

### FR-04-6 — Loading state
While the PDF is being generated, the button MUST show a loading indicator and MUST be disabled to prevent duplicate requests.

### FR-04-7 — Error handling
If PDF generation fails, the button MUST return to its normal state and display an inline error message: "PDF konnte nicht erstellt werden. Bitte versuche es erneut."

### FR-04-8 — Multi-section compatibility
If Feature 03 (Multi-Section Recipes) is deployed, the PDF generator MUST respect the `sections` data structure and render section headings in the PDF.

---

## 4. Non-Functional Requirements

### NFR-04-1 — Generation time
PDF generation MUST complete in under **10 seconds** for typical recipes (up to 20 steps, 1 cover image).

### NFR-04-2 — PDF/A preferred
The output format SHOULD comply with PDF/A (archival standard) where the chosen library supports it. This ensures the PDF is self-contained (fonts embedded) and long-term readable.

### NFR-04-3 — No auth dependency
PDF generation MUST NOT depend on Feature 05 (Auth). It MUST work in the current authless state of the app.

### NFR-04-4 — Responsive to existing styling tokens
The PDF layout SHOULD reflect the app's visual style (typography choices, spacing) to give a consistent brand feel, without requiring users to recognize it as "different" from the web UI.

### NFR-04-5 — Image handling
The cover image MUST be fetched server-side (if using server-side generation) to avoid CORS issues. If using client-side generation, the image URL must be CORS-accessible.

---

## 5. Technical Options

Three implementation approaches are under consideration. **This is an open decision — see OQ-04-1.**

---

### Option A — Client-side: react-pdf or jsPDF

Libraries: `@react-pdf/renderer` or `jsPDF` + `html2canvas`.

**How it works:**
- Define a React component tree using `@react-pdf/renderer` primitives (`<Page>`, `<Text>`, `<View>`, `<Image>`).
- `pdf(...)` call serializes to a PDF blob in the browser.
- `URL.createObjectURL` + `<a download>` triggers the download.

**Pros:**
- No server required — runs entirely client-side.
- No cold start.
- Free, no third-party API.
- Full control over layout.

**Cons:**
- `@react-pdf/renderer` uses its own layout engine — not CSS. Existing Tailwind styles cannot be reused directly; the PDF template is written from scratch.
- Complex nested layouts (multi-section, long ingredient lists) require careful manual layout code.
- Limited CSS support in `jsPDF` + `html2canvas` path; screenshot quality can be blurry.

**Estimated effort:** S (1–2 days) for basic layout; +1 day for multi-section support.

---

### Option B — Server-side: Puppeteer / Playwright

**How it works:**
- A new API route `/api/export-pdf/[id]` renders the recipe detail page (or a dedicated print-template page) in a headless Chromium instance.
- Puppeteer's `page.pdf()` generates the PDF from the fully-rendered HTML.
- The PDF is streamed back to the client.

**Pros:**
- Full CSS support — Tailwind styles render exactly as in the browser.
- No separate PDF template to maintain — shares the existing UI.
- Print CSS (`@media print`) can be used for fine-tuning.

**Cons:**
- Puppeteer / Playwright are large dependencies (~150–300 MB).
- Cold starts on Vercel Serverless Functions are slow (~3–6 seconds).
- Vercel's default function timeout (10s) may be insufficient; requires Pro plan for longer timeouts.
- Use `@sparticuz/chromium` (optimized for serverless) instead of full Puppeteer.

**Estimated effort:** M (3–5 days including print CSS + serverless Chromium setup).

---

### Option C — Third-party API: PDFShift / HTML2PDF.app

**How it works:**
- Send the recipe detail page URL (or HTML string) to a third-party PDF rendering API.
- Receive the PDF binary in response.

Services to evaluate: [PDFShift](https://pdfshift.io), [HTML2PDF.app](https://html2pdf.app), [DocRaptor](https://docraptor.com).

**Pros:**
- Simplest implementation — typically a single API call.
- No dependency management, no cold start concern.
- Full CSS/HTML support (the service runs headless Chrome).

**Cons:**
- Cost per request (most have a free tier of ~50–200 calls/month; paid above that).
- Dependency on external service availability.
- Privacy consideration: recipe data is sent to a third party.
- Requires a new `PDF_EXPORT_API_KEY` environment variable.

**Estimated effort:** S (1 day including API integration and key management).

---

**Recommendation:** Start with **Option A** (`@react-pdf/renderer`) for zero server cost and simplicity. If the PDF template becomes hard to maintain separately from the UI, migrate to Option B or C.

---

## 6. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-04-1 | Which generation approach: client-side (react-pdf), server-side (Puppeteer), or third-party API? | Architecture, cost, effort | Engineering + Product |
| OQ-04-2 | Should the PDF use a dedicated print template or the existing recipe detail page with print CSS? | Affects Option B vs. A/C | Engineering |
| OQ-04-3 | Should PDF export also be available from the recipe list (multi-recipe batch export)? | Scope expansion — out of scope v1 | Product |
| OQ-04-4 | Should the PDF be generated server-side and cached (e.g. Supabase Storage) to avoid re-generation on every click? | Performance, storage cost | Engineering |
| OQ-04-5 | What language should the PDF metadata (author, producer fields) use? | Minor UX | Engineering |

---

## 7. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-04-1 | Generation approach | **`@react-pdf/renderer` (client-side, Option A)** | Zero server cost; no cold start; no external API; full layout control |
| OQ-04-2 | Template approach | **Dedicated PDF template** | Print CSS is hard to control cross-browser without Puppeteer |
| OQ-04-3 | Batch export? | **No — single recipe only** | Batch is significant scope for a rarely needed feature |
| OQ-04-4 | Cache in Supabase Storage? | **No — generate fresh on every click** | Client-side generation is fast; caching adds complexity with no benefit at this scale |
| OQ-04-5 | PDF metadata language | **German** — set `author` to "Rezept-App" | Consistent with app language |

---

## 8. Effort Estimate

**S–M — 1–5 days**

| Task | Option A | Option B | Option C |
|---|---|---|---|
| Library setup | 1h | 3h | 1h |
| PDF template / print CSS | 5h | 4h | 2h |
| Multi-section support | 2h | 1h (CSS) | 1h |
| API route | — | 3h | 2h |
| Filename slugification utility | 1h | 1h | 1h |
| Loading + error states | 1h | 1h | 1h |
| Testing + QA | 2h | 4h | 2h |
| **Total** | **~12h** | **~17h** | **~10h** |

---

*Feature 04 of 8 — see [README.md](./README.md) for full index*
