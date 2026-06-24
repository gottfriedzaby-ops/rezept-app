import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromPdf } from "@/lib/claude";
import { checkDailyImportLimit, rateLimitErrorMessage } from "@/lib/import-rate-limit";
import { loadPdf, extractPages, getPdfTitle } from "@/lib/pdf";
import { supabaseAdmin } from "@/lib/supabase";
import {
  PDF_MSG,
  downloadPdf,
  deletePdf,
  finalizeSingleRecipe,
  type PdfSessionRow,
} from "@/lib/pdf-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface PickBody {
  sessionId: string;
  candidateId: number; // index into the session's candidates array
  password?: string;
}

async function deleteSession(sessionId: string): Promise<void> {
  try {
    await supabaseAdmin.from("pdf_import_sessions").delete().eq("id", sessionId);
  } catch {
    /* swept later by the orphan-cleanup job */
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkDailyImportLimit();
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { data: null, error: rateLimitErrorMessage(rateLimit) },
        { status: rateLimit.userId ? 429 : 401 }
      );
    }
    const userId = rateLimit.userId!;

    const { sessionId, candidateId, password } = (await request.json()) as PickBody;
    if (!sessionId || candidateId == null) {
      return NextResponse.json(
        { data: null, error: "sessionId und candidateId sind erforderlich" },
        { status: 400 }
      );
    }

    const { data } = await supabaseAdmin
      .from("pdf_import_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    const session = data as PdfSessionRow | null;

    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      if (session) {
        await deletePdf(session.storage_key);
        await deleteSession(sessionId);
      }
      return NextResponse.json({ data: null, error: PDF_MSG.sessionExpired }, { status: 410 });
    }

    const candidate = session.candidates[candidateId];
    if (!candidate) {
      return NextResponse.json({ data: null, error: "Unbekanntes Rezept" }, { status: 400 });
    }

    const buffer = await downloadPdf(session.storage_key);
    if (!buffer) {
      await deleteSession(sessionId);
      return NextResponse.json({ data: null, error: PDF_MSG.notFound }, { status: 404 });
    }

    const loaded = await loadPdf(buffer, password).catch(() => null);
    if (!loaded || (loaded.needsPassword && !loaded.authenticated)) {
      const sentinel = password ? PDF_MSG.passwordWrong : PDF_MSG.passwordRequired;
      return NextResponse.json(
        { data: null, error: loaded ? sentinel : PDF_MSG.parseFailed },
        { status: 400 }
      );
    }

    // candidate.pageRange holds send-positions within the original page_order;
    // map them back to original page numbers for re-extraction.
    const pageOrder = session.page_order;
    const [start, end] = candidate.pageRange;
    const lo = Math.max(1, Math.min(start, end));
    const hi = Math.min(pageOrder.length, Math.max(start, end));
    const originalPages = pageOrder.slice(lo - 1, hi);
    if (originalPages.length === 0) originalPages.push(...pageOrder);

    const pages = await extractPages(loaded.doc, originalPages);
    const parsed = await parseRecipeFromPdf(pages, session.filename, { detectMultiple: false }, userId).catch(
      () => null
    );
    if (!parsed || parsed.result.kind !== "single") {
      return NextResponse.json({ data: null, error: PDF_MSG.claudeFailed }, { status: 502 });
    }

    const sourceTitle = getPdfTitle(loaded.doc) ?? session.filename;
    const { status, body } = await finalizeSingleRecipe(parsed.result.recipe, sourceTitle, userId);
    // Pick complete → clean up the PDF and the session (FR-10-31).
    await deletePdf(session.storage_key);
    await deleteSession(sessionId);
    return NextResponse.json(body, { status });
  } catch (error) {
    // Never surface raw error messages (e.g. a JSON.parse error) to the user —
    // the UI is German and these strings are technical. Log the detail server-side.
    console.error("[import-pdf/pick] unhandled error:", error);
    return NextResponse.json({ data: null, error: PDF_MSG.importFailed }, { status: 500 });
  }
}
