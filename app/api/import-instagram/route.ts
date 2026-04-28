import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import { findDuplicateRecipe, checkUrlDuplicate } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHORTCODE_RE =
  /(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i;

function extractShortcode(url: string): string | null {
  const m = url.match(SHORTCODE_RE);
  return m ? m[1] : null;
}

interface OembedResponse {
  html: string;
  thumbnail_url?: string;
  author_name?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json({ data: null, error: "url is required" }, { status: 400 });
    }

    const shortcode = extractShortcode(url);
    if (!shortcode) {
      return NextResponse.json({ data: null, error: "Ungültige Instagram-URL" }, { status: 400 });
    }

    const earlyDuplicate = await checkUrlDuplicate(shortcode);
    if (earlyDuplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...earlyDuplicate },
        { status: 409 }
      );
    }

    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN ist nicht gesetzt");

    const oembedUrl = new URL("https://graph.facebook.com/v18.0/instagram_oembed");
    oembedUrl.searchParams.set("url", url);
    oembedUrl.searchParams.set("fields", "thumbnail_url,author_name,html");
    oembedUrl.searchParams.set("access_token", token);

    const oembedRes = await fetch(oembedUrl.toString(), { cache: "no-store" });
    if (!oembedRes.ok) {
      let metaError = "";
      try {
        const body = await oembedRes.json() as { error?: { message?: string; code?: number; type?: string } };
        metaError = body?.error?.message ?? "";
      } catch { /* ignore */ }
      console.error("[import-instagram] oEmbed API error", oembedRes.status, metaError);
      const userMessage = metaError
        ? `Instagram-Fehler: ${metaError}`
        : `Instagram-Post konnte nicht geladen werden (HTTP ${oembedRes.status})`;
      return NextResponse.json({ data: null, error: userMessage }, { status: 400 });
    }

    const oembed = (await oembedRes.json()) as OembedResponse;

    const $ = cheerio.load(oembed.html);
    const caption = $("blockquote p").text().trim();

    if (!caption) {
      return NextResponse.json(
        { data: null, error: "Keine Bildunterschrift gefunden" },
        { status: 400 }
      );
    }

    const parsed = await parseRecipeFromText(caption, "instagram", shortcode);

    if (parsed.ingredients.length === 0 && parsed.steps.length === 0) {
      return NextResponse.json(
        { data: null, error: "Kein Rezept in der Bildunterschrift gefunden" },
        { status: 422 }
      );
    }

    const reviewed = await reviewAndImproveRecipe(parsed);

    const duplicate = await findDuplicateRecipe(reviewed.title, shortcode);
    if (duplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...duplicate },
        { status: 409 }
      );
    }

    return NextResponse.json({
      data: {
        recipe: reviewed,
        sourceTitle: oembed.author_name ?? null,
        imageUrl: oembed.thumbnail_url ?? null,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
