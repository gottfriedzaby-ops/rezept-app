import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type $Type = ReturnType<typeof cheerio.load>;

function extractCoverImage($: $Type, pageUrl: string): string | null {
  const resolve = (src: string | undefined): string | null => {
    if (!src || src.startsWith("data:")) return null;
    try { return new URL(src, pageUrl).href; } catch { return null; }
  };

  // 1. og:image
  const og = resolve($('meta[property="og:image"]').attr("content"));
  if (og) return og;

  // 2. twitter:image
  const tw = resolve(
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[name="twitter:image:src"]').attr("content")
  );
  if (tw) return tw;

  // 3. Largest img by explicit dimensions
  let bestSrc = "";
  let bestArea = 0;
  $("img").each((_, el) => {
    const $el = $(el);
    const w = parseInt($el.attr("width") ?? "0");
    const h = parseInt($el.attr("height") ?? "0");
    const area = w * h;
    if (area > bestArea) {
      const src =
        $el.attr("src") || $el.attr("data-src") || $el.attr("data-lazy-src");
      if (src && !src.startsWith("data:") && !/logo|icon|avatar|banner|spinner|\.svg/i.test(src)) {
        bestArea = area;
        bestSrc = src;
      }
    }
  });
  return resolve(bestSrc) ?? null;
}

function extractStepImages($: $Type, pageUrl: string): string[] {
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

    // Extract cover image before any DOM stripping
    const imageUrl = extractCoverImage($, url);

    $("script, style").remove();
    const stepImages = extractStepImages($, url);

    $("nav, header, footer, aside, iframe").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    const parsed = await parseRecipeFromText(text, "url", url);
    const reviewed = await reviewAndImproveRecipe(parsed);

    const duplicate = await findDuplicateRecipe(reviewed.title, url);
    if (duplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...duplicate },
        { status: 409 }
      );
    }

    return NextResponse.json({
      data: { recipe: reviewed, sourceTitle: pageTitle || reviewed.title, stepImages, imageUrl },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
