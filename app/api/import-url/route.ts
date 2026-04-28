import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import type { JsonLdRecipeData } from "@/lib/claude";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type $Type = ReturnType<typeof cheerio.load>;

// Images whose URL or alt text suggest non-food product content
const STEP_IMAGE_EXCLUSION_PATTERN =
  /logo|icon|avatar|banner|spinner|placeholder|\.svg|pixel|tracking|product|shop|store|buy|cart|gallery|catalog|manufacturer|oven|grill|appliance|equipment|accessory|accessories/i;

// URL keywords that suggest a step image is food-related
const FOOD_POSITIVE_PATTERN =
  /recipe|food|ingredient|cook|bake|pizza|pasta|dough|meat|vegetable|dish|meal|prep|zubereitung|schritt/i;

// UI chrome class/id patterns to strip from DOM before text extraction
// Intentionally excludes expand/toggle/collapse/accordion — recipe steps are often
// inside accordion containers and must not be removed along with the UI chrome.
// Icon/button text is handled upstream by removing <svg> and <button> elements.
const UI_CHROME_PATTERN =
  /sidebar|popup|modal|overlay|cookie|banner|breadcrumb|pagination|social|share|newsletter|subscribe|advertisement/i;

// Residual UI artifact strings to remove from extracted text
const UI_ARTIFACT_PATTERNS: RegExp[] = [
  /\d+\s*expand/gi,
  /simple tick icon/gi,
  /chevron (down|up|left|right) icon/gi,
  /close (icon|button)/gi,
  /skip (to )?content/gi,
  /back to top/gi,
  /scroll (to )?top/gi,
];

function isRecipeNode(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const type = (obj as Record<string, unknown>)["@type"];
  if (typeof type === "string") return type === "Recipe" || type.endsWith("/Recipe");
  if (Array.isArray(type))
    return type.some((t) => typeof t === "string" && (t === "Recipe" || t.endsWith("/Recipe")));
  return false;
}

function extractJsonLd($: $Type): JsonLdRecipeData | null {
  const candidates: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        // Flatten @graph arrays
        const graph = (item as Record<string, unknown>)["@graph"];
        if (Array.isArray(graph)) {
          candidates.push(...graph.filter(isRecipeNode));
        } else if (isRecipeNode(item)) {
          candidates.push(item);
        }
      }
    } catch { /* malformed JSON-LD — skip */ }
  });

  const node = candidates[0];
  if (!node) return null;
  return node as JsonLdRecipeData;
}

function extractCoverImage(
  $: $Type,
  pageUrl: string,
  jsonLd: JsonLdRecipeData | null
): string | null {
  const resolve = (src: string | undefined): string | null => {
    if (!src || src.startsWith("data:")) return null;
    try { return new URL(src, pageUrl).href; } catch { return null; }
  };

  // 1. JSON-LD image (most authoritative — directly describes the recipe's food photo)
  if (jsonLd?.image) {
    const img = jsonLd.image;
    const src =
      typeof img === "string" ? img :
      Array.isArray(img) ? img[0] :
      typeof img === "object" && img.url ? img.url :
      undefined;
    const resolved = resolve(src);
    if (resolved) return resolved;
  }

  // 2. og:image
  const og = resolve($('meta[property="og:image"]').attr("content"));
  if (og) return og;

  // 3. twitter:image
  const tw = resolve(
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[name="twitter:image:src"]').attr("content")
  );
  if (tw) return tw;

  // 4. Largest img by explicit dimensions
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

// Fraction characters → decimal numbers
const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125,
};

// Deterministically extract metric amounts from parenthetical annotations like
// "4½ cups (500 grams)", "2 scant teaspoons (10 grams)", "½ of ¼ tsp (½ gram)".
// Returns a formatted preamble to prepend to the Claude prompt so the model never
// has to guess at amounts that the source already states explicitly.
function buildKnownAmountsPreamble(text: string): string {
  // Match (NUMBER UNIT) or (FRACTION UNIT) inside parentheses
  const re = /\(([½¼¾⅓⅔⅛]|\d+(?:\.\d+)?)\s*(grams?|g\b|ml\b|millilitres?|litres?|l\b|kg\b)\)/gi;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const rawAmt = m[1];
    const rawUnit = m[2].toLowerCase();
    const unit = /^g/.test(rawUnit) ? "g" : /^ml|^mill/.test(rawUnit) ? "ml" : /^kg/.test(rawUnit) ? "kg" : "l";
    const amount = UNICODE_FRACTIONS[rawAmt] ?? parseFloat(rawAmt);
    if (!isNaN(amount) && amount > 0) {
      // Include up to 80 chars of context before the parenthesis so Claude can
      // match the amount to the correct ingredient name.
      const ctxStart = Math.max(0, m.index - 80);
      const ctx = text.slice(ctxStart, m.index).replace(/\s+/g, " ").trim();
      lines.push(`- ${amount} ${unit}  (context: "${ctx}")`);
    }
  }
  if (lines.length === 0) return "";
  return (
    "KNOWN METRIC AMOUNTS — use these exact values for ingredient amounts; " +
    "do NOT re-derive them from cup/tsp/oz measurements:\n" +
    lines.join("\n") +
    "\n\n"
  );
}

// Recursively flatten a Contentful Rich Text JSON node tree into plain text.
// Contentful stores recipe content in `rich-text` attributes as JSON like:
// { "type": "root", "children": [{ "type": "paragraph", "children": [{ "type": "text", "value": "…" }] }] }
function flattenRichTextNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  if (typeof obj.value === "string") return obj.value;
  if (Array.isArray(obj.children))
    return (obj.children as unknown[]).map(flattenRichTextNode).join(" ");
  return "";
}

// Extract text from all [rich-text] attribute nodes in the DOM.
// Cheerio decodes HTML entities in attribute values automatically, so we get clean JSON.
// This captures ingredient amounts and step text that would otherwise be invisible to
// $("body").text() because they're only in data attributes (not visible text nodes).
function extractRichTextContent($: $Type): string {
  const parts: string[] = [];
  $("[rich-text]").each((_, el) => {
    try {
      const val = $(el).attr("rich-text");
      if (val) parts.push(flattenRichTextNode(JSON.parse(val)));
    } catch { /* skip malformed */ }
  });
  return parts.join(" ");
}

function extractStepImages($: $Type, pageUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  function tryAdd(src: string | undefined, altText?: string) {
    if (!src || src.startsWith("data:")) return;
    try {
      const abs = new URL(src, pageUrl).href;
      if (seen.has(abs)) return;
      if (STEP_IMAGE_EXCLUSION_PATTERN.test(abs)) return;
      if (altText && /product|shop|buy|oven|grill|appliance|equipment|accessory/i.test(altText)) return;
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
    .each((_, el) => tryAdd(srcOf(el), $(el).attr("alt")));

  if (images.length === 0) {
    $("img").each((_, el) => {
      const $el = $(el);
      const width = parseInt($el.attr("width") ?? "0");
      const height = parseInt($el.attr("height") ?? "0");
      if ((width > 0 && width < 150) || (height > 0 && height < 150)) return;
      if (!$el.attr("srcset") && width < 150 && height < 150) return;
      tryAdd(srcOf(el), $el.attr("alt"));
    });
  }

  // Only return step images if at least one URL looks food-related
  const hasFoodImage = images.some((u) => FOOD_POSITIVE_PATTERN.test(u));
  return hasFoodImage ? images.slice(0, 10) : [];
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json({ data: null, error: "url is required" }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { data: null, error: "Seite konnte nicht geladen werden" },
        { status: 400 }
      );
    }
    const html = await response.text();

    const $ = cheerio.load(html);
    // Use head > title to avoid picking up SVG <title> elements throughout the page
    const pageTitle = ($("head > title").first().text() || $("title").first().text()).trim();

    // Extract JSON-LD structured data before any DOM stripping
    const jsonLd = extractJsonLd($);

    // Extract cover image before any DOM stripping
    const imageUrl = extractCoverImage($, url, jsonLd);

    $("script, style").remove();
    const stepImages = extractStepImages($, url);

    // Expanded element removal to eliminate UI chrome from text
    $("nav, header, footer, aside, iframe, noscript, svg, button").remove();
    $('[aria-hidden="true"]').remove();
    $(".sr-only, .visually-hidden").remove();
    $('[class*="visually-hidden"]').remove();

    $("[class]").each((_, el) => {
      if (UI_CHROME_PATTERN.test($(el).attr("class") ?? "")) $(el).remove();
    });
    $("[id]").each((_, el) => {
      if (UI_CHROME_PATTERN.test($(el).attr("id") ?? "")) $(el).remove();
    });

    // Combine rich-text attribute content (invisible to body.text()) with visible body text.
    const richTextContent = extractRichTextContent($);
    const rawText = (richTextContent + " " + $("body").text()).replace(/\s+/g, " ").trim();

    // Strip residual UI artifact strings
    let cleanedText = rawText;
    for (const pattern of UI_ARTIFACT_PATTERNS) {
      cleanedText = cleanedText.replace(pattern, " ");
    }
    cleanedText = cleanedText.replace(/\s+/g, " ").trim();

    // Deterministically extract parenthetical metric amounts (e.g. "2 tsp (10 grams)")
    // and prepend them as a structured hint so Claude never has to guess these values.
    const knownAmounts = buildKnownAmountsPreamble(richTextContent);
    const textForClaude = knownAmounts + cleanedText;

    const parsed = await parseRecipeFromText(textForClaude, "url", url, jsonLd ?? undefined);
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
