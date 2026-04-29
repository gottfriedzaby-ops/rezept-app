# Feature 02 — Multi-Image Recipe Import

**Mehrere Fotos gleichzeitig importieren**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **M** (3–8 days) |
| Priority | Medium |
| Dependencies | None |

---

## 1. Overview

The current photo import flow accepts a single image. However, many recipes are documented across multiple photos — for example, an Instagram carousel showing the ingredients list on one slide, the steps on a second, and the finished dish on a third. A handwritten recipe book may also span two pages photographed separately.

This feature extends the photo import flow to accept **up to 6 images** in a single import session. All images are sent to the Claude API in a single multimodal message, giving Claude full context across the entire set before it outputs structured recipe JSON.

**Goal:** Allow users to capture multi-page or carousel recipes in one import action without having to merge images manually.

---

## 2. User Stories

### US-02-1 — Select multiple photos at once
> Als Nutzer möchte ich beim Foto-Import mehrere Bilder gleichzeitig auswählen können (bis zu 6), damit ich ein Rezept, das auf mehreren Seiten steht, in einem Schritt importieren kann.

**Acceptance criteria:**
- File picker allows multi-select (`multiple` attribute on `<input type="file">`).
- Maximum 6 images enforced client-side with a clear error message if exceeded.

---

### US-02-2 — Drag-and-drop multiple images
> Als Nutzer möchte ich mehrere Bilder per Drag-and-Drop in den Import-Bereich ziehen können, damit der Ablauf schneller geht als über den Datei-Browser.

**Acceptance criteria:**
- Drop zone accepts multiple files simultaneously.
- Each dropped file is appended to the current selection (up to the maximum).
- Duplicate file names are ignored.

---

### US-02-3 — Preview all selected images before import
> Als Nutzer möchte ich vor dem Import alle ausgewählten Bilder als Vorschau sehen, damit ich prüfen kann, ob ich die richtigen Fotos gewählt habe.

**Acceptance criteria:**
- Thumbnail grid shows all selected images with a remove button per image.
- Images are displayed in the order they will be sent to Claude.

---

### US-02-4 — Reorder images before submitting
> Als Nutzer möchte ich die Reihenfolge der Bilder vor dem Import ändern können, damit Claude die Seiten in der richtigen Reihenfolge liest.

**Acceptance criteria:**
- User can drag-and-drop thumbnails to reorder.
- Order is preserved when the form is submitted.

---

### US-02-5 — Send all images to Claude in one call
> Als Nutzer möchte ich, dass alle meine Bilder gemeinsam analysiert werden, damit Claude aus dem Gesamtbild das vollständige Rezept extrahieren kann.

**Acceptance criteria:**
- All images are included as base64-encoded `image` content blocks in a single Claude API message.
- Claude's response is a single structured recipe JSON (not one per image).

---

## 3. Functional Requirements

### FR-02-1 — Multi-file input
The photo import UI component MUST accept multiple image files. The file input MUST:
- Have `accept="image/jpeg,image/png,image/webp,image/heic"`.
- Enforce a maximum of **6 files** client-side.
- Show an inline error: "Maximal 6 Bilder erlaubt" if the limit is exceeded.

### FR-02-2 — Client-side image compression
Each selected image MUST be compressed individually before upload using the existing compression logic (or browser Canvas API). Target per-image size: **≤ 1.5 MB**. Images already under 1.5 MB MUST be sent as-is.

### FR-02-3 — Thumbnail preview grid
After file selection (or drop), the UI MUST display a grid of thumbnails:
- Thumbnail size: approximately 100×100 px.
- Each thumbnail has an "×" remove button.
- The grid reflects current order.

### FR-02-4 — Reorder via drag-and-drop
The thumbnail grid MUST support drag-and-drop reordering. The reordered array MUST be used when building the FormData payload.

### FR-02-5 — Total upload size cap
The combined size of all images after compression MUST NOT exceed **20 MB**. If the total exceeds this limit, the submit button MUST be disabled and the user MUST see: "Gesamtgröße überschreitet 20 MB. Bitte Bilder verkleinern oder entfernen."

### FR-02-6 — Updated API endpoint `/api/import-photo`
The existing endpoint MUST be updated to:
- Accept multiple images from FormData (keys: `image_0`, `image_1`, ..., `image_N`).
- Maintain backward compatibility: a single `image` key MUST still be accepted.
- Return the standard `{ data, error }` response shape.

### FR-02-7 — Claude multimodal message construction
The API route MUST construct a single Claude API request containing all images as content blocks:
```json
{
  "role": "user",
  "content": [
    { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "..." } },
    { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "..." } },
    { "type": "text", "text": "<existing recipe extraction prompt>" }
  ]
}
```
Images MUST appear in the user-specified order before the text prompt.

### FR-02-8 — Source metadata
When multiple images are uploaded, `source_type` MUST remain `'photo'`. `source_value` MUST store the first image's filename (or a comma-separated list — see Open Questions).

### FR-02-9 — Error handling
If one or more images fail compression, the import MUST:
- Skip the failed image.
- Notify the user: "1 Bild konnte nicht verarbeitet werden und wurde übersprungen."
- Continue with the remaining images if at least 1 is valid.

---

## 4. Out of Scope (v1)

The following is explicitly **out of scope for v1** of this feature:

- **Instagram carousel URL pasting:** Pasting an Instagram carousel URL to automatically fetch all slides. This requires Instagram API access or scraping, which is a separate, complex integration. Planned for a future version.
- **Automatic page detection:** Detecting page boundaries or splitting a multi-page document scan automatically.
- **Per-step image association:** Linking specific images to specific recipe steps from a multi-image import.

---

## 5. Non-Functional Requirements

### NFR-02-1 — Upload size cap
Total payload MUST NOT exceed 20 MB to avoid Vercel's 4.5 MB request body limit on the default plan. Consider using Supabase Storage as a relay if larger uploads are required in the future.

**Note:** Vercel's default body size limit for API routes is 4.5 MB. Multi-image imports approaching this limit will require either:
1. Client-side uploads to Supabase Storage first, then passing storage URLs to the API route, OR
2. Upgrading to a Vercel plan with higher limits.

This is an open architectural question — see OQ-02-2.

### NFR-02-2 — Timeout
The API route timeout MUST be increased to at least **60 seconds** (Vercel Pro: up to 300s). The current single-image timeout may be insufficient for 6-image Claude calls.

### NFR-02-3 — Progress feedback
The UI MUST show a loading state during the API call (spinner or progress indicator). For large uploads, a "Wird hochgeladen..." message before "Claude analysiert Rezept..." is helpful UX.

### NFR-02-4 — Accessibility
The drag-and-drop zone MUST have a keyboard-accessible fallback (the file input). Thumbnails MUST have `alt` text.

### NFR-02-5 — Browser compatibility
HEIC/HEIF images from iPhones MUST be converted to JPEG client-side before upload (using a library such as `heic2any`) because Claude API does not accept HEIC directly.

---

## 6. Data Model Impact

No new columns required for v1. The existing `source_value` column (text) is sufficient to store the primary filename.

If per-image metadata needs to be preserved in the future, a new `source_images` JSONB column could store an array of filenames/URLs:
```sql
-- Future, not v1:
ALTER TABLE recipes ADD COLUMN source_images jsonb DEFAULT '[]';
```

---

## 7. Technical Notes

### Recommended client-side drag-and-drop
Use the browser's native HTML5 drag-and-drop API or a lightweight library such as `@dnd-kit/core` (already commonly used in Next.js projects). Avoid heavy libraries like `react-beautiful-dnd` (deprecated).

### Image compression
Use the Canvas API via a utility like `browser-image-compression` (npm). Already available in most Next.js setups without additional config.

### HEIC conversion
```ts
import heic2any from 'heic2any';
if (file.type === 'image/heic' || file.name.endsWith('.heic')) {
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
  // use converted blob
}
```

---

## 8. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-02-1 | What is the maximum number of images? 6 is proposed — is this sufficient for typical use cases? | FR-02-1 cap | Product |
| OQ-02-2 | How to handle Vercel's 4.5 MB body limit? Upload-to-storage-first vs. stream approach? | Architecture | Engineering |
| OQ-02-3 | Should `source_value` store all filenames or only the first? If all, comma-separated or JSON array? | Data model | Engineering |
| OQ-02-4 | Should per-step images from multi-image input be preserved and linked to steps? (Out of scope v1 — but when?) | Future scope | Product |
| OQ-02-5 | Instagram carousel import — priority for v2? Requires separate research into scraping / API access | Roadmap | Product |

---

## 9. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-02-1 | Max images | **6** | Covers all realistic carousel use cases |
| OQ-02-2 | Vercel 4.5 MB body limit | **Upload to Supabase Storage first, pass URLs to API** | Bypasses Vercel limit entirely; URLs useful for long-term storage |
| OQ-02-3 | `source_value` with multiple files | **Comma-separated filenames** | No new column needed at this scale |
| OQ-02-4 | Per-step image linking | **Out of scope permanently** | AI reliability + UX complexity far outweighs benefit |
| OQ-02-5 | Instagram carousel import | **Deferred indefinitely** | Screenshots + multi-photo upload solves 95% of cases |

---

## 10. Effort Estimate

**M — 3–8 days**

| Task | Estimate |
|---|---|
| Multi-file input UI + validation | 2h |
| Client-side compression per image | 1h |
| HEIC conversion helper | 1h |
| Thumbnail grid + remove button | 2h |
| Drag-and-drop reorder (dnd-kit) | 3h |
| Total size cap validation | 1h |
| API endpoint update (multi-image FormData) | 2h |
| Claude multimodal message builder | 2h |
| Error handling (skip failed images) | 1h |
| Timeout config + loading states | 1h |
| Testing + QA (various image counts/sizes) | 4h |
| **Total** | **~20h** |

---

*Feature 02 of 8 — see [README.md](./README.md) for full index*
