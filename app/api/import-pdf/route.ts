import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromPdf } from "@/lib/claude";
import { checkDailyImportLimit, rateLimitErrorMessage } from "@/lib/import-rate-limit";
import { loadPdf, detectScanned, extractPages, getPdfTitle } from "@/lib/pdf";
import { supabaseAdmin } from "@/lib/supabase";
import {
  MAX_PDF_BYTES,
  MAX_PAGES,
  MAX_SCANNED_PAGES,
  SESSION_TTL_MINUTES,
  PDF_MSG,
  downloadPdf,
  deletePdf,
  finalizeSingleRecipe,
} from "@/lib/pdf-import";

// mupdf is a WASM/Node module and the hybrid call sends up to 10 page images,
// so this must run on the Node runtime with a generous timeout (NFR-10-4/5).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ImportPdfBody {
  storageKey: string;
  filename?: string;
  pageOrder?: number[];
  password?: string;
}

export async function POST(request: NextRequest) {
  let storageKey = "";
  let keepObject = false;
  try {
    const rateLimit = await checkDailyImportLimit();
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { data: null, error: rateLimitErrorMessage(rateLimit) },
        { status: rateLimit.userId ? 429 : 401 }
      );
    }
    const userId = rateLimit.userId!;

    const body = (await request.json()) as ImportPdfBody;
    storageKey = body.storageKey ?? "";
    const filename = body.filename?.trim() || "rezept.pdf";

    if (!storageKey) {
      return NextResponse.json({ data: null, error: "storageKey ist erforderlich" }, { status: 400 });
    }
    // Objects are written by the client under `${userId}/…` (Storage RLS enforces
    // this); re-check here since the route uses the service-role client.
    if (!storageKey.startsWith(`${userId}/`)) {
      return NextResponse.json({ data: null, error: "Kein Zugriff auf diese Datei" }, { status: 403 });
    }

    const buffer = await downloadPdf(storageKey);
    if (!buffer) {
      return NextResponse.json({ data: null, error: PDF_MSG.notFound }, { status: 404 });
    }
    if (buffer.length > MAX_PDF_BYTES) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.tooLarge }, { status: 400 });
    }

    const loaded = await loadPdf(buffer, body.password).catch(() => null);
    if (!loaded) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.parseFailed }, { status: 400 });
    }
    if (loaded.needsPassword && !loaded.authenticated) {
      // Keep the object so the user can retry with a password in the same session.
      const sentinel = body.password ? PDF_MSG.passwordWrong : PDF_MSG.passwordRequired;
      return NextResponse.json({ data: null, error: sentinel }, { status: 400 });
    }

    const { doc, pageCount } = loaded;
    if (pageCount < 1) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.parseFailed }, { status: 400 });
    }
    if (pageCount > MAX_PAGES) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.tooManyPages }, { status: 400 });
    }
    if (detectScanned(doc) && pageCount > MAX_SCANNED_PAGES) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.scannedTooLong }, { status: 400 });
    }

    // Normalise the user-edited page order: keep valid, distinct 1-based pages;
    // default to all pages in natural order.
    const allPages = Array.from({ length: pageCount }, (_, i) => i + 1);
    const requested = Array.isArray(body.pageOrder) && body.pageOrder.length > 0 ? body.pageOrder : allPages;
    const seen = new Set<number>();
    const pageOrder: number[] = [];
    for (const n of requested) {
      if (Number.isInteger(n) && n >= 1 && n <= pageCount && !seen.has(n)) {
        seen.add(n);
        pageOrder.push(n);
      }
    }
    if (pageOrder.length === 0) pageOrder.push(...allPages);

    const pages = await extractPages(doc, pageOrder);
    const sourceTitle = getPdfTitle(doc) ?? filename;

    const parsed = await parseRecipeFromPdf(pages, filename, { detectMultiple: true }, userId).catch(() => null);
    if (!parsed) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.claudeFailed }, { status: 502 });
    }

    if (parsed.result.kind === "multi") {
      // Persist a short-lived session so the picker follow-up can re-extract the
      // chosen recipe's pages. Keep the PDF object until the pick completes.
      const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString();
      const { data: session, error: sessionError } = await supabaseAdmin
        .from("pdf_import_sessions")
        .insert({
          user_id: userId,
          storage_key: storageKey,
          filename,
          page_order: pageOrder,
          candidates: parsed.result.candidates,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (sessionError || !session) {
        await deletePdf(storageKey);
        return NextResponse.json({ data: null, error: PDF_MSG.parseFailed }, { status: 500 });
      }
      keepObject = true;
      return NextResponse.json({
        data: { kind: "multi", candidates: parsed.result.candidates, sessionId: session.id },
        error: null,
      });
    }

    const { status, body: respBody } = await finalizeSingleRecipe(parsed.result.recipe, sourceTitle, userId);
    await deletePdf(storageKey); // parsing complete — no retention (FR-10-31)
    return NextResponse.json(respBody, { status });
  } catch (error) {
    if (storageKey && !keepObject) await deletePdf(storageKey);
    console.error("[import-pdf] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
