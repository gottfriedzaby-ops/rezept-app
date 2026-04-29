import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import { findDuplicateRecipe, checkUrlDuplicate } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHORTCODE_RE =
  /(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extractShortcode(url: string): string | null {
  const m = url.match(SHORTCODE_RE);
  return m ? m[1] : null;
}

async function fetchCaption(shortcode: string): Promise<{ caption: string; imageUrl: string | null; author: string | null }> {
  // Instagram's public embed page — no API key or app review needed
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  const res = await fetch(embedUrl, {
    headers: { "User-Agent": BROWSER_UA },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Instagram-Seite konnte nicht geladen werden (HTTP ${res.status})`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Caption selectors — Instagram changes class names; try several
  const caption =
    $(".Caption").text().trim() ||
    $(".caption").text().trim() ||
    $("[class*='Caption']").first().text().trim() ||
    $("article .comment").first().text().trim() ||
    extractCaptionFromScript($) ||
    "";

  const imageUrl =
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="twitter:image"]').attr("content") ??
    null;

  const author =
    $('meta[property="og:title"]').attr("content")?.replace(/ on Instagram.*/, "").trim() ??
    null;

  return { caption, imageUrl: imageUrl ?? null, author };
}

// Try to extract caption from embedded JSON in <script> tags
function extractCaptionFromScript($: ReturnType<typeof cheerio.load>): string {
  let found = "";
  $("script").each((_, el) => {
    if (found) return;
    const src = $(el).html() ?? "";

    // Pattern 1: "text":"caption text here"
    const m1 = src.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m1 && m1[1].length > 20) {
      found = m1[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      return;
    }

    // Pattern 2: window.__additionalDataLoaded
    const m2 = src.match(/window\.__additionalDataLoaded\s*\(.+?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m2 && m2[1].length > 20) {
      found = m2[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  });
  return found;
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

    const { caption, imageUrl, author } = await fetchCaption(shortcode);

    if (!caption) {
      return NextResponse.json(
        { data: null, error: "Caption konnte nicht gelesen werden. Ist der Post öffentlich?" },
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
        sourceTitle: author,
        imageUrl,
      },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
