import type { ParsedRecipe } from "@/types/recipe";
import type { PdfRecipeCandidate } from "@/lib/claude";
import { supabaseAdmin } from "@/lib/supabase";
import { reviewAndImproveRecipe } from "@/lib/claude";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

export const PDF_BUCKET = "recipe-pdfs-temp";
export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB (spec D3)
export const MAX_PAGES = 10; // spec D2
export const MAX_SCANNED_PAGES = 5; // spec D5
export const SESSION_TTL_MINUTES = 30;

// German user-facing messages (spec §8). The two PASSWORD_* values are string
// sentinels — the client recognises them and shows the password field, mirroring
// the existing `error: "duplicate"` sentinel convention.
export const PDF_MSG = {
  tooLarge: "PDF überschreitet das Maximum von 10 MB.",
  tooManyPages: "PDF überschreitet das Maximum von 10 Seiten. Bitte entferne nicht benötigte Seiten.",
  scannedTooLong:
    "Eingescannte PDFs sind auf 5 Seiten begrenzt. Bitte nutze stattdessen den Foto-Import oder eine PDF mit Textebene.",
  passwordRequired: "PDF_PASSWORD_REQUIRED",
  passwordWrong: "PDF_PASSWORD_WRONG",
  parseFailed: "Die PDF konnte nicht gelesen werden. Bitte versuche es mit einer anderen Datei.",
  claudeFailed: "Das Rezept konnte nicht extrahiert werden. Bitte versuche es erneut.",
  sessionExpired: "Die Sitzung ist abgelaufen. Bitte lade die PDF erneut hoch.",
  notFound: "Die PDF konnte nicht gefunden werden. Bitte lade sie erneut hoch.",
} as const;

export interface PdfSessionRow {
  id: string;
  user_id: string;
  storage_key: string;
  filename: string;
  page_order: number[];
  candidates: PdfRecipeCandidate[];
  expires_at: string;
}

export async function downloadPdf(storageKey: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(PDF_BUCKET).download(storageKey);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function deletePdf(storageKey: string): Promise<void> {
  // Best-effort — never let cleanup failures surface to the user (NFR-10-2).
  try {
    await supabaseAdmin.storage.from(PDF_BUCKET).remove([storageKey]);
  } catch {
    /* swept later by the orphan-cleanup job */
  }
}

/**
 * Run the standard review pass + PDF-only (stage-3) duplicate check on a freshly
 * parsed recipe and build the import response. Shared by /api/import-pdf (single
 * path) and /api/import-pdf/pick.
 */
export async function finalizeSingleRecipe(
  parsed: ParsedRecipe,
  sourceTitle: string,
  userId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { recipe: reviewed } = await reviewAndImproveRecipe(parsed, userId);
  const duplicate = await findDuplicateRecipe(reviewed.title, reviewed.source.value, userId, "pdf");
  if (duplicate) {
    return { status: 409, body: { data: null, error: "duplicate", ...duplicate } };
  }
  return {
    status: 200,
    body: { data: { kind: "single", recipe: reviewed, sourceTitle, imageUrl: null }, error: null },
  };
}
