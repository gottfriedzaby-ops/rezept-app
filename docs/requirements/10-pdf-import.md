# Feature 10 — PDF Recipe Import

**Rezepte aus PDF-Dateien importieren**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **L** (8–15 days) |
| Priority | Medium |
| Dependencies | Multi-Image Import (Feature 02), Auth (Feature 05), Nutrition (Feature 08), User-Scoped Duplicate Check (Feature 09) |

---

## 1. Overview

Many users keep recipes as PDF files: cookbooks scanned to PDF, magazine clippings exported from Pocket / browser print-to-PDF, recipe collections downloaded from blogs, or PDFs received via messaging apps and email. Today these recipes can only be entered by manually retyping them or by taking screenshots and using the photo import.

This feature adds a dedicated PDF import path that:
- Accepts a PDF file (max 10 MB, max 10 pages),
- Extracts both the embedded text layer **and** rasterised page images,
- Sends the combined material as a **single multimodal Claude call** (hybrid extraction) for maximum context,
- Supports password-protected PDFs by prompting the user for the password,
- Supports image-only / scanned PDFs of up to 5 pages,
- Detects multi-recipe PDFs and lets the user pick which recipe to import (one at a time),
- Stores the original filename as `source_value` and discards the PDF after parsing (no retention).

**Goal:** Bring PDF cookbooks, clippings, and downloaded recipe sheets into the user's library with the same quality bar as the URL and photo import paths.

---

## 2. Business Requirements

- **BR-01** Users must be able to import PDF recipes without retyping or screenshot-stitching.
- **BR-02** Imported PDF recipes must carry the same provenance contract as every other source: `source_type` and `source_value` are mandatory.
- **BR-03** PDF files must not be retained on the server after parsing. The application stores extracted text/images only as long as needed for the Claude call; the PDF itself is discarded.
- **BR-04** PDF imports must respect the existing per-user daily import cap (20 imports / user / calendar day, UTC). One PDF upload counts as one import regardless of page count.
- **BR-05** Multi-recipe PDFs must not silently merge recipes. The user explicitly picks which recipe to import.

---

## 3. User Stories

### US-10-1 — Import a single-recipe PDF
> Als Nutzer möchte ich eine PDF-Datei mit einem Rezept hochladen und ein vollständig strukturiertes Rezept im Review-Formular sehen, damit ich PDF-Sammlungen ohne Abtippen in meine Bibliothek übernehmen kann.

**Acceptance criteria:**
- A new import option "PDF" exists alongside URL / YouTube / Foto / Instagram.
- Selecting a PDF file ≤ 10 MB and ≤ 10 pages produces a populated review form.
- Saving stores a recipe with `source_type = 'pdf'` and `source_value = <originalFilename>`.

### US-10-2 — Page preview with reorder/remove
> Als Nutzer möchte ich vor dem Import die einzelnen PDF-Seiten als Vorschau sehen und Seiten neu ordnen oder entfernen können, damit Claude nur die relevanten Seiten in der richtigen Reihenfolge erhält.

**Acceptance criteria:**
- After file selection the UI shows full-page thumbnails for every page.
- Each thumbnail has a remove button (×).
- Thumbnails can be reordered via drag-and-drop (same UX as `02-multi-image-import.md`).
- The order/selection in the UI is what gets sent to Claude.

### US-10-3 — Password-protected PDF
> Als Nutzer möchte ich eine passwortgeschützte PDF importieren können, indem ich das Passwort eingebe, damit auch verschlüsselte PDFs nutzbar sind.

**Acceptance criteria:**
- When the uploaded PDF is encrypted, the UI shows a password input field with a clear instruction.
- Submitting the correct password unlocks the PDF for parsing in the same session.
- A wrong password shows: "Falsches Passwort. Bitte erneut versuchen."

### US-10-4 — Image-only / scanned PDF (≤ 5 pages)
> Als Nutzer möchte ich auch eingescannte PDFs ohne Textebene importieren können, solange sie kurz sind, damit ich auch ältere Cookbook-Scans nutzen kann.

**Acceptance criteria:**
- A scanned (image-only) PDF with ≤ 5 pages is processed by sending page images to Claude.
- A scanned PDF with more than 5 pages is rejected with: "Eingescannte PDFs sind auf 5 Seiten begrenzt. Bitte nutze stattdessen den Foto-Import oder eine PDF mit Textebene."

### US-10-5 — Multi-recipe PDF picker
> Als Nutzer möchte ich bei einer PDF mit mehreren Rezepten auswählen können, welches Rezept importiert werden soll, damit ich nicht versehentlich mehrere Rezepte zu einem zusammengemischt bekomme.

**Acceptance criteria:**
- When Claude detects more than one recipe, the UI shows a picker listing each detected recipe (title + short description).
- The user picks exactly one recipe, which proceeds into the standard review form.
- Importing additional recipes from the same PDF requires a new import session (each counts toward the daily limit).

### US-10-6 — File too large / too many pages
> Als Nutzer möchte ich beim Hochladen einer zu großen oder zu langen PDF eine klare Fehlermeldung sehen, damit ich weiß, was zu tun ist.

**Acceptance criteria:**
- A PDF > 10 MB is rejected before upload with: "PDF überschreitet das Maximum von 10 MB."
- A PDF with > 10 pages is rejected after page count detection with: "PDF überschreitet das Maximum von 10 Seiten. Bitte entferne nicht benötigte Seiten."

### US-10-7 — Daily import cap
> Als Nutzer möchte ich, dass ein PDF-Import genau einmal auf mein Tageslimit angerechnet wird, damit das Limit für alle Importtypen einheitlich bleibt.

**Acceptance criteria:**
- A successful PDF import increments the user's daily import counter by exactly 1.
- A rejected upload (validation failure before Claude is called) does not increment the counter.
- A PDF with multiple recipes still counts as 1 import for the picked recipe; importing a second recipe from the same PDF is a new import.

### US-10-8 — Duplicate check uses fuzzy title only
> Als Nutzer möchte ich, dass bei PDF-Importen nur die unscharfe Titelprüfung (Stage 3) gegen meine eigene Bibliothek läuft, damit Filename-Kollisionen mich nicht blockieren.

**Acceptance criteria:**
- Stages 1 and 2 (exact `source_value` and normalised URL match) are skipped for PDF imports.
- Stage 3 (Jaccard ≥ 0.85 against the user's own recipes) runs unchanged.

---

## 4. Functional Requirements

### 4.1 UI / Upload

- **FR-10-1** A new entry "PDF" must be added to the import source selector alongside URL / YouTube / Foto / Instagram.
- **FR-10-2** The PDF upload UI must accept files via file picker and via drag-and-drop. `accept="application/pdf"`.
- **FR-10-3** The client must validate file size ≤ 10 MB before upload. Oversize files must be rejected with the German message in §8.
- **FR-10-4** After file selection the client must render full-page thumbnails for every page of the PDF.
- **FR-10-5** Thumbnails must support remove (×) and drag-and-drop reorder. The UX must mirror `02-multi-image-import.md`.
- **FR-10-6** If the PDF is encrypted, a password input field must appear instead of the page thumbnail grid; thumbnails are rendered only after the password unlocks the document.
- **FR-10-7** The submit button must be disabled while: page count > 10 after user edits, total selected pages = 0, or password is required and not yet entered.

### 4.2 Storage relay (upload)

- **FR-10-10** The client must upload the PDF to Supabase Storage first, then submit the resulting Storage URL (and the user-edited page order, plus the password if applicable) to `/api/import-pdf`. This mirrors the photo import pattern (FR-30 of `requirements.md`).
- **FR-10-11** The Storage object must be placed in a private bucket `recipe-pdfs-temp` with a TTL or post-parse delete (see FR-10-31). The bucket must not be publicly readable.

### 4.3 Server-side validation

- **FR-10-20** The API route must re-validate file size ≤ 10 MB after fetching the PDF from Storage.
- **FR-10-21** The API route must determine page count and reject PDFs with > 10 pages.
- **FR-10-22** The API route must determine whether the PDF has a usable embedded text layer. If no text layer is detected and page count > 5, the request must be rejected with the scanned-PDF message (§8).
- **FR-10-23** If the PDF is encrypted, the API route must use the password supplied in the request body. If no password is supplied or the password is wrong, the route must return an actionable German error and the UI must surface the password prompt.

### 4.4 Hybrid text + image extraction

- **FR-10-30** For every page kept by the user, the server must extract:
  - The embedded text content of the page (when present), and
  - A rasterised PNG/JPEG image of the page (always, regardless of text-layer presence).
- **FR-10-31** All extracted material must be held in memory only. The original PDF file in Supabase Storage must be deleted as soon as parsing is complete (success or failure). No PDF retention policy.

### 4.5 Claude multimodal call

- **FR-10-40** A single Claude API call must be made containing all kept pages as multimodal content blocks. For each page, the call must include both the page's rasterised image and its extracted text (when available), in user-specified page order.
- **FR-10-41** A new function `parseRecipeFromPdf` must be added to `lib/claude.ts` that builds and dispatches this multimodal message and returns a structured response. The Claude model is `claude-sonnet-4-6` per NFR-05 of `requirements.md`.
- **FR-10-42** The Claude prompt must:
  - Instruct Claude to detect whether the PDF contains one or multiple recipes.
  - When multiple recipes are detected, return an array of `{ title, shortDescription, pageRange }` candidate entries instead of a fully parsed recipe.
  - When a single recipe is detected (or after the user has picked one in a follow-up call), return a `ParsedRecipe` per the existing schema.
- **FR-10-43** After the user picks a recipe (multi-recipe case), the server must issue a second Claude call constrained to the picked recipe's page range, returning a `ParsedRecipe`.
- **FR-10-44** The standard review pass (`reviewAndImproveRecipe`) must run on the resulting `ParsedRecipe` exactly as for other source types (FR-02 of `requirements.md`).

### 4.6 Persistence

- **FR-10-50** On confirm, the recipe must be persisted with:
  - `source_type = 'pdf'`,
  - `source_value = <original filename including extension>` (e.g. `"rezept.pdf"`),
  - `source_title = <PDF document title metadata, if present>` (optional),
  - All other fields per FR-03 of `requirements.md`.
- **FR-10-51** `estimateNutrition` must run on confirm, identical to all other import types (per `08-nutrition-calculation.md`).
- **FR-10-52** The PDF cover image is **not** stored as a recipe `image_url`. PDF imports do not auto-derive a cover image; the user can attach one later via the existing edit flow. (See OQ-10-1.)

### 4.7 Duplicate check

- **FR-10-60** PDF imports must skip duplicate-check stages 1 and 2 (exact `source_value` and normalised URL match).
- **FR-10-61** PDF imports must run duplicate-check stage 3 (Jaccard ≥ 0.85 against the current user's recipes), unchanged.
- **FR-10-62** Stage 3 scoping continues to be user-scoped per `09-user-scoped-duplicate-check.md`.

### 4.8 Rate limiting

- **FR-10-70** A successful PDF import counts as exactly 1 against the user's daily 20-import cap (FR-133 of `requirements.md`). The cap is enforced at the start of `/api/import-pdf` and at `/api/recipes/confirm`, per the existing pattern.
- **FR-10-71** Validation failures that occur before the Claude call (size, page count, encryption, scanned-PDF rejection) do not consume a quota slot.
- **FR-10-72** Picking a second recipe from the same PDF requires a new import session and consumes a new quota slot.

---

## 5. UI / UX Flow

The flow has the following states. Each transition is a client-side state change unless explicitly marked as an API call.

```
┌─────────────────────────────────────────────────────────────┐
│ 1. SELECT     → user picks "PDF" import type                 │
│ 2. UPLOAD     → file picker / drag-and-drop                  │
│      ├─ size > 10 MB        → reject (FR-10-3)               │
│      └─ ok → upload to Supabase Storage (FR-10-10)           │
│ 3. PASSWORD?  → if encrypted, show password input (FR-10-6)  │
│      ├─ wrong password      → error + retry                  │
│      └─ ok                                                    │
│ 4. PREVIEW    → render full-page thumbnails (FR-10-4)        │
│      ├─ pages > 10          → reject (FR-10-21)              │
│      └─ scanned & pages > 5 → reject (FR-10-22)              │
│ 5. EDIT       → user removes / reorders pages (FR-10-5)      │
│ 6. SUBMIT     → POST /api/import-pdf                         │
│ 7. CLAUDE     → parseRecipeFromPdf (multimodal, hybrid)       │
│      ├─ single recipe       → step 9                         │
│      └─ multiple recipes    → step 8                         │
│ 8. PICKER     → user picks one recipe → second Claude call    │
│      → ParsedRecipe                                           │
│ 9. REVIEW PASS → reviewAndImproveRecipe                       │
│10. REVIEW FORM → user edits ingredients / steps               │
│11. CONFIRM    → POST /api/recipes/confirm                     │
│      → duplicate check (stage 3 only) → persist               │
│      → estimateNutrition (best-effort)                        │
│      → delete PDF from recipe-pdfs-temp                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Technical Architecture

### 6.1 Storage relay
PDFs are uploaded by the client directly to a private Supabase Storage bucket `recipe-pdfs-temp`. The API route receives a Storage object key, fetches the PDF server-side, processes it, and deletes the object after parsing (success or error). This mirrors the photo import pattern and avoids Vercel's request-body size limits (NFR-06 of `requirements.md`).

### 6.2 PDF parsing libraries
Two responsibilities, two libraries:
- **Text extraction + page count + encryption check:** a server-side Node-compatible PDF library such as `pdfjs-dist` (Mozilla's PDF.js) or `pdf-parse`. Final library choice is an implementation decision — see OQ-10-2.
- **Page rasterisation (PDF page → PNG/JPEG):** `pdfjs-dist` with `node-canvas`, or a comparable headless rendering library. Final library choice is OQ-10-2.

Both responsibilities must run in a Node.js runtime (not Edge), since PDF parsing requires Node APIs (`Buffer`, native canvas).

### 6.3 In-memory only
Per FR-10-31, neither the original PDF nor any rendered page images are persisted. All buffers are released when the request handler returns.

### 6.4 Hybrid multimodal Claude call
The Claude content array for each page contains both an `image` block and a `text` block:
```jsonc
{
  "role": "user",
  "content": [
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "<page1 png>" } },
    { "type": "text",  "text": "PAGE 1 TEXT LAYER:\n<extracted text of page 1>" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "<page2 png>" } },
    { "type": "text",  "text": "PAGE 2 TEXT LAYER:\n<extracted text of page 2>" },
    // …
    { "type": "text",  "text": "<recipe extraction prompt>" }
  ]
}
```
For image-only PDFs (no text layer), the `PAGE N TEXT LAYER` blocks are omitted for those pages.

---

## 7. API Route Specification

### 7.1 `POST /app/api/import-pdf`

**Request body (JSON):**
```ts
{
  storageKey: string;        // path of uploaded PDF in recipe-pdfs-temp
  filename: string;          // original filename, e.g. "rezept.pdf"
  pageOrder: number[];       // user-edited page order (1-based indices of original pages)
  password?: string;         // present iff PDF is encrypted
}
```

**Response (success, single recipe):**
```ts
{
  data: {
    kind: "single";
    parsedRecipe: ParsedRecipe;
  };
  error: null;
}
```

**Response (success, multi-recipe):**
```ts
{
  data: {
    kind: "multi";
    candidates: Array<{
      id: string;             // ephemeral id used for the follow-up pick call
      title: string;
      shortDescription: string;
      pageRange: [number, number];
    }>;
    sessionId: string;        // server-side handle for the picker follow-up
  };
  error: null;
}
```

**Response (error):**
Standard `{ data: null, error: { message: string, code?: string } }`. Error codes used:
`PDF_TOO_LARGE`, `PDF_TOO_MANY_PAGES`, `PDF_SCANNED_TOO_LONG`, `PDF_PASSWORD_REQUIRED`, `PDF_PASSWORD_WRONG`, `PDF_PARSE_FAILED`, `RATE_LIMIT_EXCEEDED`.

### 7.2 `POST /app/api/import-pdf/pick`

Used when the first call returned `kind: "multi"`.

**Request body:**
```ts
{
  sessionId: string;
  candidateId: string;
}
```

**Response:** `{ data: { kind: "single"; parsedRecipe: ParsedRecipe }, error: null }`.

The session token must be short-lived (server-side memory or a short-TTL store keyed by user id) and must be invalidated as soon as the user picks a candidate or after a short timeout.

### 7.3 `/api/recipes/confirm`
No new endpoint. The existing confirm endpoint must accept `source_type = 'pdf'` and `source_value = <filename>` and run the duplicate-check (stage 3 only) per FR-10-60 / FR-10-61.

---

## 8. Error States and German Error Messages

| Condition | German message |
|---|---|
| File > 10 MB (client or server) | "PDF überschreitet das Maximum von 10 MB." |
| Pages > 10 | "PDF überschreitet das Maximum von 10 Seiten. Bitte entferne nicht benötigte Seiten." |
| Scanned PDF, pages > 5 | "Eingescannte PDFs sind auf 5 Seiten begrenzt. Bitte nutze stattdessen den Foto-Import oder eine PDF mit Textebene." |
| Password required | "Diese PDF ist passwortgeschützt. Bitte gib das Passwort ein." |
| Password wrong | "Falsches Passwort. Bitte erneut versuchen." |
| PDF cannot be parsed at all | "Die PDF konnte nicht gelesen werden. Bitte versuche es mit einer anderen Datei." |
| Claude call failed | "Das Rezept konnte nicht extrahiert werden. Bitte versuche es erneut." |
| Daily import limit reached | "Dein Tageslimit von 20 Importen ist erreicht. Versuche es morgen wieder." (per existing pattern) |
| Multi-recipe picker timeout | "Die Sitzung ist abgelaufen. Bitte lade die PDF erneut hoch." |

All error messages must be returned via the `{ data, error }` contract (NFR-03 of `requirements.md`).

---

## 9. Non-Functional Requirements

- **NFR-10-1 (Memory):** PDF processing buffers (text extracts + rasterised images) must be released as soon as the Claude call completes. No long-lived caches.
- **NFR-10-2 (No retention):** The original PDF must be deleted from `recipe-pdfs-temp` immediately after parsing. A scheduled cleanup job (or a Storage TTL policy of 1 hour) must delete any orphan objects from failed requests.
- **NFR-10-3 (Privacy):** The `recipe-pdfs-temp` bucket must be private (no public read). Object keys must be unguessable (UUID-prefixed) and scoped per user id.
- **NFR-10-4 (Timeout):** The API route timeout must be at least **120 seconds** to accommodate 10-page hybrid Claude calls. (Vercel Pro: up to 300s.)
- **NFR-10-5 (Runtime):** The route must run in the Node.js runtime (not Edge) due to PDF parsing requirements.
- **NFR-10-6 (Progress feedback):** The UI must show distinct loading states: "Wird hochgeladen…", "Seiten werden vorbereitet…", "Claude analysiert Rezept…".
- **NFR-10-7 (Accessibility):** Page thumbnails must have alt text indicating page number ("Seite 1 von 7").
- **NFR-10-8 (Test coverage):** New Jest tests must cover: file size validation, page count validation, scanned-PDF detection (≤ 5 vs > 5), password handling (correct + wrong), single vs multi-recipe response shape, duplicate-check skip of stages 1 and 2, rate-limit increment exactly once on success, source_value persistence as filename.

---

## 10. Database Changes

### 10.1 Migration — extend `source_type` CHECK constraint
A new SQL migration must add `'pdf'` to the allowed values of the `recipes.source_type` CHECK constraint.

Suggested filename: `supabase/migrations/<timestamp>_feature10_pdf_source_type.sql`.

```sql
-- Drop the existing check constraint and recreate with 'pdf' added
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_source_type_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_source_type_check
  CHECK (source_type IN ('url','photo','youtube','instagram','manual','pdf'));
```

(The exact constraint name in the live database must be verified before writing the migration; the canonical one in `supabase/schema.sql` lists `'url','photo','youtube','manual'` — Instagram was added in an earlier migration. The migration must add `'pdf'` to whatever the current set is.)

### 10.2 Storage bucket
A new private bucket `recipe-pdfs-temp` must be created in Supabase Storage with:
- public read: **off**,
- per-user RLS write policy on the prefix `{user_id}/`,
- a cleanup mechanism (TTL policy or scheduled delete) for orphan objects.

No new columns are required on `recipes`.

---

## 11. Out of Scope (v1)

- **OOS-10-1** Importing more than one recipe in a single session from a multi-recipe PDF. The user must reupload (or pick again) for each additional recipe.
- **OOS-10-2** PDFs > 10 pages or > 10 MB. Splitting a large PDF is the user's responsibility.
- **OOS-10-3** Scanned PDFs > 5 pages. Users must use the photo import flow.
- **OOS-10-4** Auto-deriving a cover image from the PDF (e.g. picking the first page or detecting a finished-dish photo).
- **OOS-10-5** OCR as a separate explicit step. Image-only pages are handled by Claude's vision capability inside the multimodal call.
- **OOS-10-6** Long-term PDF retention or "view original PDF" links from the saved recipe.
- **OOS-10-7** Importing PDFs from URL (i.e. pasting a PDF URL). Only file uploads are supported.
- **OOS-10-8** Bulk PDF imports (a folder / multiple files at once).

---

## 12. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-10-1 | Should the first page (or a specific page) be auto-saved as a cover image candidate that the user can opt into during review? | UX | Product |
| OQ-10-2 | Final choice of PDF parsing/rendering library (`pdfjs-dist` vs `pdf-parse` vs alternative). Implementation decision deferred to engineering. | Implementation | Engineering |
| OQ-10-3 | Should the multi-recipe picker show a thumbnail of the candidate's first page? | UX | Product |
| OQ-10-4 | Should the cleanup of `recipe-pdfs-temp` use a Supabase Storage TTL policy or a scheduled Vercel cron job? | Ops | Engineering |
| OQ-10-5 | Should encrypted PDFs that the user successfully unlocks be re-uploaded back to Storage in unlocked form during the same session, or always re-decrypted on each backend step? | Implementation | Engineering |

---

## 13. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| D1  | Text-only vs image-only vs hybrid extraction | **Hybrid: text + page images in one multimodal Claude call** | Maximum context; Claude can use the text layer where present and fall back to vision where it isn't |
| D2  | Maximum page count | **10 pages** | Balances usefulness vs Claude latency / cost / token budget |
| D3  | Maximum file size | **10 MB** | Covers typical recipe PDFs without straining storage relay |
| D3b | Upload mechanism | **Supabase Storage relay (client uploads first, API receives Storage URL)** | Same pattern as photo import; avoids Vercel's request-body limits |
| D4  | Password-protected PDFs | **Password input field; user supplies password** | Better UX than rejecting outright |
| D5  | Image-only / scanned PDFs | **Allowed up to 5 pages; reject larger scanned PDFs and recommend photo import** | Vision quality is acceptable on short scans; long scans are a worse experience than the photo import path |
| D6  | What `source_value` stores | **Original filename (e.g. `"rezept.pdf"`)** | Filename is the only stable identifier the user recognises after the PDF is discarded |
| D7  | PDF retention | **Process in memory, delete after parsing — no retention** | Privacy and storage cost; users keep the PDF themselves |
| D8  | Multi-recipe PDFs | **Detect, then user picks one recipe per import** | Keeps each saved recipe clean; avoids merging |
| D9  | Page preview UX | **Full-page thumbnails with reorder/remove (mirrors multi-image photo import)** | Consistency with existing UX users already know |
| D10 | DB schema | **New migration adds `'pdf'` to `source_type` CHECK constraint** | Required to allow inserts |
| D11 | Doc filename | **`10-pdf-import.md`** | Continues feature numbering |
| D12 | Rate limiting | **One PDF upload = one import counted against 20/day cap** | Consistent with all other import types |
| D13 | Nutrition | **Run `estimateNutrition` on confirm, same as all other types** | Consistency with `08-nutrition-calculation.md` |
| D14 | Duplicate check | **Skip stages 1 and 2 (URL match); run only stage 3 (fuzzy title Jaccard)** | `source_value` is a filename, not a URL — URL-based stages are meaningless and would produce false positives via filename collisions |

---

## 14. Effort Estimate

**L — 8–15 days**

| Task | Estimate |
|---|---|
| PDF library evaluation + integration (`pdfjs-dist` or alternative) | 4h |
| Server-side PDF parsing: text extraction, page count, encryption detection | 4h |
| Server-side page rasterisation (PNG/JPEG per page) | 4h |
| Supabase Storage relay (private bucket `recipe-pdfs-temp`, RLS, cleanup) | 4h |
| New API route `/api/import-pdf` (Node runtime, validation, hybrid Claude call) | 6h |
| New API route `/api/import-pdf/pick` (multi-recipe picker follow-up) | 3h |
| New `parseRecipeFromPdf` in `lib/claude.ts` (multimodal builder, prompt, single + multi response shapes) | 6h |
| Client UI: file input + drag-and-drop, size validation | 2h |
| Client UI: page thumbnail rendering (using `pdfjs-dist` in browser) | 4h |
| Client UI: drag-and-drop reorder + remove (reuse pattern from feature 02) | 3h |
| Client UI: password prompt | 2h |
| Client UI: multi-recipe picker | 3h |
| Integration with existing review form + confirm flow | 3h |
| Database migration (`source_type` CHECK + storage bucket + RLS) | 2h |
| Rate-limit integration | 1h |
| Duplicate check: skip stages 1 & 2 for `source_type = 'pdf'` | 1h |
| Error handling + German error messages | 2h |
| Jest tests (per NFR-10-8) | 8h |
| QA: encrypted, scanned, multi-recipe, edge sizes | 6h |
| **Total** | **~68h** |

---

## 15. Glossary

| Term | Definition |
|---|---|
| **Hybrid extraction** | Sending both the embedded text layer and a rasterised page image of each PDF page to Claude in one multimodal call. |
| **Scanned / image-only PDF** | A PDF whose pages contain no usable text layer, only raster images (typically a scan of a paper document). |
| **Text layer** | The selectable, copy-pasteable text embedded in a PDF page (as opposed to text rendered into a page image). |
| **Multi-recipe PDF** | A PDF whose content contains more than one recipe (e.g. a chapter export from a cookbook). |
| **Page rasterisation** | Rendering a PDF page to a bitmap image (PNG/JPEG) for transmission to a vision model. |
| **Storage relay** | The pattern where the client uploads a binary asset to Supabase Storage first and then sends only a Storage URL/key to the API route, bypassing Vercel's request-body size limit. |

---

*Feature 10 of the requirements set — see [README.md](./README.md) for full index.*
