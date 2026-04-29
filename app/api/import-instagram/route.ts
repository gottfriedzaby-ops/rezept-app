import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import { findDuplicateRecipe, checkUrlDuplicate } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHORTCODE_RE =
  /(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i;

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function extractShortcode(url: string): string | null {
  const m = url.match(SHORTCODE_RE);
  return m ? m[1] : null;
}

async function fetchPostData(shortcode: string): Promise<{ caption: string; imageUrl: string | null; author: string | null }> {
  // Instagram serves full og:description (up to ~2500 chars) to Googlebot — no API key needed
  const postUrl = `https://www.instagram.com/p/${shortcode}/`;
  const res = await fetch(postUrl, {
    headers: { "User-Agent": GOOGLEBOT_UA },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Instagram-Seite konnte nicht geladen werden (HTTP ${res.status})`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const rawDescription = $('meta[property="og:description"]').attr("content") ?? "";
  // Strip the "X likes, Y comments - username on Date: " prefix Instagram adds
  const caption = rawDescription.replace(/^[\d,.]+ likes[^:]*:\s*"?/i, "").replace(/"$/, "").trim();

  const imageUrl = $('meta[property="og:image"]').attr("content") ?? null;

  const rawTitle = $('meta[property="og:title"]').attr("content") ?? "";
  // og:title format: "Display Name on Instagram: ..." (may be multiline — use [\s\S]* not .*)
  const authorMatch = rawTitle.match(/^([\s\S]+?)\s+on Instagram/i);
  const author = authorMatch ? authorMatch[1].trim() : null;

  return { caption, imageUrl, author };
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

    const { caption, imageUrl, author } = await fetchPostData(shortcode);

    if (!caption) {
      return NextResponse.json(
        { data: null, error: "Caption konnte nicht gelesen werden. Ist der Post öffentlich?" },
        { status: 400 }
      );
    }

    // Pre-filter: common "recipe not in caption" signals
    const NO_RECIPE_SIGNALS = /link in (my )?bio|type .{1,20} in (the )?comments?|send .{1,20} (to )?(your )?dm|recipe in (the )?comments?|check (the )?bio|find it (in|through|via)/i;
    if (NO_RECIPE_SIGNALS.test(caption)) {
      return NextResponse.json(
        { data: null, error: "Kein Rezept in der Bildunterschrift gefunden — der Post verweist auf Bio oder Kommentare" },
        { status: 422 }
      );
    }

    const parsed = await parseRecipeFromText(caption, "instagram", shortcode);

    // Require at least 3 ingredients and 2 steps to guard against Claude hallucinating
    // a recipe from a dish name alone
    if (parsed.ingredients.length < 3 || parsed.steps.length < 2) {
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
