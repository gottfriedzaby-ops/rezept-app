import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText } from "@/lib/claude";

function extractStepImages($: ReturnType<typeof cheerio.load>, pageUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  function tryAdd(src: string | undefined) {
    if (!src || src.startsWith("data:")) return;
    try {
      const abs = new URL(src, pageUrl).href;
      if (seen.has(abs)) return;
      if (/logo|icon|avatar|banner|spinner|placeholder|\.svg|pixel|tracking/i.test(abs)) return;
      seen.add(abs);
      images.push(abs);
    } catch { /* invalid URL */ }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function srcOf(el: any): string | undefined {
    const $el = $(el);
    return (
      $el.attr("src") ||
      $el.attr("data-src") ||
      $el.attr("data-lazy-src") ||
      $el.attr("data-original") ||
      ($el.attr("srcset")
        ? $el.attr("srcset")!.split(",")[0].trim().split(/\s+/)[0]
        : undefined)
    );
  }

  $(
    '[class*="step"], [class*="instruction"], [class*="direction"], [class*="method"], [id*="step"], [id*="instruction"]'
  )
    .find("img")
    .each((_, el) => tryAdd(srcOf(el)));

  if (images.length === 0) {
    $("img").each((_, el) => {
      const $el = $(el);
      const width = parseInt($el.attr("width") ?? "0");
      const height = parseInt($el.attr("height") ?? "0");
      if ((width > 0 && width < 150) || (height > 0 && height < 150)) return;
      if (!$el.attr("srcset") && width < 150 && height < 150) return;
      tryAdd(srcOf(el));
    });
  }

  return images.slice(0, 10);
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json({ data: null, error: "url is required" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RecipeBot/1.0)" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { data: null, error: "Seite konnte nicht geladen werden" },
        { status: 400 }
      );
    }
    const html = await response.text();

    const $ = cheerio.load(html);
    const pageTitle = $("title").text().trim();

    $("script, style").remove();
    const stepImages = extractStepImages($, url);

    $("nav, header, footer, aside, iframe").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    const parsed = await parseRecipeFromText(text, "url", url);

    return NextResponse.json({
      data: { recipe: parsed, sourceTitle: pageTitle || parsed.title, stepImages },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
