import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPdf, detectScanned, renderThumbnails } from "@/lib/pdf";
import { MAX_PDF_BYTES, MAX_PAGES, PDF_MSG, downloadPdf, deletePdf } from "@/lib/pdf-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Render a couple of pages beyond the limit so the user can see and remove
// surplus pages to get back under the cap.
const MAX_THUMB_PAGES = MAX_PAGES + 2;

interface PreviewBody {
  storageKey: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = (await request.json()) as PreviewBody;
    const storageKey = body.storageKey ?? "";
    if (!storageKey) {
      return NextResponse.json({ data: null, error: "storageKey ist erforderlich" }, { status: 400 });
    }
    if (!storageKey.startsWith(`${user.id}/`)) {
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
      // Keep the object so the user can retry with a password.
      const sentinel = body.password ? PDF_MSG.passwordWrong : PDF_MSG.passwordRequired;
      return NextResponse.json({ data: null, error: sentinel }, { status: 400 });
    }
    if (loaded.pageCount < 1) {
      await deletePdf(storageKey);
      return NextResponse.json({ data: null, error: PDF_MSG.parseFailed }, { status: 400 });
    }

    const scanned = detectScanned(loaded.doc);
    const thumbs = await renderThumbnails(loaded.doc, MAX_THUMB_PAGES);
    return NextResponse.json({
      data: { numPages: loaded.pageCount, scanned, thumbs },
      error: null,
    });
  } catch (error) {
    console.error("[import-pdf/preview] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
