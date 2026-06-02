import type { Document } from "mupdf";

// mupdf is a WASM module that uses top-level await for its runtime init, so it
// must be loaded via dynamic import() and can never be require()'d. We memoise
// the import promise so the WASM module is initialised only once per process.
type MupdfModule = typeof import("mupdf");
let mupdfPromise: Promise<MupdfModule> | null = null;
function getMupdf(): Promise<MupdfModule> {
  if (!mupdfPromise) mupdfPromise = import("mupdf");
  return mupdfPromise;
}

export interface LoadedPdf {
  doc: Document;
  pageCount: number;
  /** true when the PDF is encrypted and a password is required to read it */
  needsPassword: boolean;
  /** true when the document is readable (not encrypted, or password accepted) */
  authenticated: boolean;
}

export interface ExtractedPage {
  /** 1-based page number in the original document */
  pageNumber: number;
  /** embedded text-layer content (empty string for image-only pages) */
  text: string;
  /** rasterised page rendered to PNG, base64-encoded (no data: prefix) */
  imageBase64: string;
}

export interface PdfThumb {
  pageNumber: number;
  /** small JPEG preview as a data: URL, ready for an <img src> */
  dataUrl: string;
}

// Render scale relative to the PDF's native 72-DPI page box. 2.0 (~144 DPI)
// keeps A4/Letter pages just under Claude's 1568px long-edge cap, so the image
// is used at full resolution without server- or API-side downscaling.
const RENDER_SCALE = 2.0;

// A PDF counts as "scanned" (no usable text layer) when the combined non-whitespace
// text across all pages stays below this many characters. Genuine recipe text layers
// contain hundreds–thousands of characters; image-only scans contain effectively none.
const SCANNED_TEXT_THRESHOLD = 40;

/**
 * Open a PDF from a buffer, applying a password if the document is encrypted.
 * pageCount is 0 until the document is authenticated.
 */
export async function loadPdf(buffer: Buffer, password?: string): Promise<LoadedPdf> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), "application/pdf");
  const needsPassword = doc.needsPassword();
  let authenticated = !needsPassword;
  if (needsPassword && password) {
    // authenticatePassword returns a non-zero bitfield on success, 0 on failure.
    authenticated = doc.authenticatePassword(password) !== 0;
  }
  return { doc, pageCount: authenticated ? doc.countPages() : 0, needsPassword, authenticated };
}

/** PDF document Title metadata, if present — used as source_title (FR-10-50). */
export function getPdfTitle(doc: Document): string | null {
  try {
    const title = doc.getMetaData("info:Title")?.trim();
    return title ? title : null;
  } catch {
    return null;
  }
}

/**
 * Whether the document lacks a usable text layer (image-only / scanned).
 * Short-circuits as soon as enough text is seen, so text PDFs return fast.
 */
export function detectScanned(doc: Document): boolean {
  const pageCount = doc.countPages();
  let total = 0;
  for (let i = 0; i < pageCount; i++) {
    total += doc.loadPage(i).toStructuredText().asText().replace(/\s+/g, "").length;
    if (total >= SCANNED_TEXT_THRESHOLD) return false;
  }
  return true;
}

/**
 * Extract the requested pages (1-based, in the given order) as hybrid material:
 * the embedded text layer plus a rasterised PNG of each page. Held in memory only.
 */
export async function extractPages(doc: Document, pageNumbers: number[]): Promise<ExtractedPage[]> {
  const mupdf = await getMupdf();
  const matrix = mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE);
  const pages: ExtractedPage[] = [];
  for (const pageNumber of pageNumbers) {
    const page = doc.loadPage(pageNumber - 1); // mupdf page indices are 0-based
    const text = page.toStructuredText().asText().trim();
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    pages.push({
      pageNumber,
      text,
      imageBase64: Buffer.from(pixmap.asPNG()).toString("base64"),
    });
  }
  return pages;
}

// Small page previews rendered server-side (replaces client-side pdf.js). Capped
// so a huge PDF doesn't render an unbounded number of thumbnails.
const THUMB_SCALE = 0.5;

export async function renderThumbnails(doc: Document, maxPages: number): Promise<PdfThumb[]> {
  const mupdf = await getMupdf();
  const matrix = mupdf.Matrix.scale(THUMB_SCALE, THUMB_SCALE);
  const count = Math.min(doc.countPages(), maxPages);
  const thumbs: PdfThumb[] = [];
  for (let i = 0; i < count; i++) {
    const pixmap = doc.loadPage(i).toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    const jpeg = Buffer.from(pixmap.asJPEG(60)).toString("base64");
    thumbs.push({ pageNumber: i + 1, dataUrl: `data:image/jpeg;base64,${jpeg}` });
  }
  return thumbs;
}
