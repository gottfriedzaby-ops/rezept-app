import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import type { JsonLdRecipeData } from "@/lib/claude";
import { findDuplicateRecipe, checkUrlDuplicate } from "@/lib/duplicate-check";
import { buildKnownAmountsPreamble, UNICODE_FRACTIONS } from "@/lib/amounts";
import { checkDailyImportLimit, rateLimitErrorMessage } from "@/lib/import-rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type $Type = ReturnType<typeof cheerio.load>;

const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
  /related|comment|sidebar|popup|modal|overlay|cookie|banner|breadcrumb|pagination|social|share|newsletter|subscribe|advertisement/i;

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
    let src: string | undefined;
    if (typeof img === "string") {
      src = img;
    } else if (Array.isArray(img)) {
      const first = img[0];
      // Elements may be plain strings or ImageObject-like { url: "..." }
      if (typeof first === "string") src = first;
      else if (first && typeof first === "object") src = (first as Record<string, unknown>).url as string | undefined;
    } else if (typeof img === "object" && img !== null) {
      src = img.url;
    }
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

  // 4. First sufficiently large img — recipe cover is almost always the first prominent image;
  // related-recipe thumbnails appear later in the page.
  let found: string | null = null;
  $("img").each((_, el) => {
    if (found) return false as unknown as void; // break
    const $el = $(el);
    const w = parseInt($el.attr("width") ?? "0");
    const h = parseInt($el.attr("height") ?? "0");
    const hasSrcset = !!$el.attr("srcset");
    if (!hasSrcset && w < 300 && h < 300) return;
    const src = $el.attr("src") || $el.attr("data-src") || $el.attr("data-lazy-src");
    if (!src || src.startsWith("data:")) return;
    if (/logo|icon|avatar|banner|spinner|\.svg/i.test(src)) return;
    found = src;
  });
  return resolve(found ?? "") ?? null;
}

// Contentful rich-text format: { "type": "root", "children": [{ "type": "paragraph", "children": [{ "type": "text", "value": "…" }] }] }
function flattenRichTextNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  if (typeof obj.value === "string") return obj.value;
  if (Array.isArray(obj.children))
    return (obj.children as unknown[]).map(flattenRichTextNode).join(" ");
  return "";
}

// Content in [rich-text] data attributes is invisible to $("body").text() — must be extracted separately.
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

  // Only return step images if at least one URL looks food-related
  const hasFoodImage = images.some((u) => FOOD_POSITIVE_PATTERN.test(u));
  return hasFoodImage ? images.slice(0, 10) : [];
}

// Cloudflare managed-challenges can return HTTP 200 with a JS-challenge page
// instead of 403, so status-code checks alone are insufficient.
function isBlockedByCloudflare(html: string): boolean {
  return (
    html.includes("cf-wrapper") ||
    html.includes("challenges.cloudflare.com") ||
    html.includes("Sorry, you have been blocked")
  );
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

    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json({ data: null, error: "url is required" }, { status: 400 });
    }

    const earlyDuplicate = await checkUrlDuplicate(url);
    if (earlyDuplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...earlyDuplicate },
        { status: 409 }
      );
    }

    let response = await fetch(url, { headers: { "User-Agent": GOOGLEBOT_UA } });
    let usedBrowserUA = false;
    // Cloudflare and similar WAFs block known crawler UAs with 403/406.
    // Retry once with a browser UA before giving up.
    if (!response.ok && (response.status === 403 || response.status === 406)) {
      response = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
      usedBrowserUA = true;
    }
    if (!response.ok) {
      return NextResponse.json(
        { data: null, error: "Seite konnte nicht geladen werden" },
        { status: 400 }
      );
    }
    let html = await response.text();
    // Cloudflare managed-challenge: HTTP 200 with challenge HTML (no 403 to detect).
    // Retry with browser UA if we haven't already.
    if (!usedBrowserUA && isBlockedByCloudflare(html)) {
      const r2 = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
      if (r2.ok) html = await r2.text();
    }
    if (isBlockedByCloudflare(html)) {
      return NextResponse.json(
        { data: null, error: "Diese Website ist durch Cloudflare geschützt und kann leider nicht automatisch importiert werden. Bitte das Rezept manuell eingeben." },
        { status: 400 }
      );
    }

    const $ = cheerio.load(html);
    // head > title avoids picking up SVG <title> elements scattered through the page
    const pageTitle = ($("head > title").first().text() || $("title").first().text()).trim();

    const jsonLd = extractJsonLd($);
    const imageUrl = extractCoverImage($, url, jsonLd);

    $("script, style").remove();
    const stepImages = extractStepImages($, url);

    // og:title / h1 extracted before structural removal — h1 may live inside <header>
    const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? null;
    const h1Text = $("h1").first().text().trim() || null;
    const titleHint = ogTitle || h1Text || null;

    $("nav, header, footer, aside, iframe, noscript, svg, button").remove();
    $('[aria-hidden="true"]').remove();
    $(".sr-only, .visually-hidden").remove();
    $('[class*="visually-hidden"]').remove();

    // Never remove <body> or <html> — WordPress often adds state classes like
    // "cookies-not-set" to <body>, which would match UI_CHROME_PATTERN and wipe
    // the entire page content, leaving Claude with an empty string to hallucinate from.
    $("[class]").each((_, el) => {
      if (el.name === "body" || el.name === "html") return;
      if (UI_CHROME_PATTERN.test($(el).attr("class") ?? "")) $(el).remove();
    });
    $("[id]").each((_, el) => {
      if (el.name === "body" || el.name === "html") return;
      if (UI_CHROME_PATTERN.test($(el).attr("id") ?? "")) $(el).remove();
    });

    // Combine rich-text attribute content (invisible to body.text()) with visible body text.
    // Prefer a focused article/main container to reduce cross-recipe noise on pages without JSON-LD.
    const richTextContent = extractRichTextContent($);
    const ARTICLE_SELECTORS = [
      "article",
      "main",
      '[class*="entry-content"]',
      '[class*="post-content"]',
      '[class*="recipe-content"]',
      '[class*="article-content"]',
    ];
    let articleText: string | null = null;
    for (const sel of ARTICLE_SELECTORS) {
      const t = $(sel).first().text().trim();
      if (t.length > 200) { articleText = t; break; }
    }
    const rawText = (richTextContent + " " + (articleText ?? $("body").text())).replace(/\s+/g, " ").trim();

    let cleanedText = rawText;
    for (const pattern of UI_ARTIFACT_PATTERNS) {
      cleanedText = cleanedText.replace(pattern, " ");
    }
    cleanedText = cleanedText.replace(/\s+/g, " ").trim();

    const knownAmounts = buildKnownAmountsPreamble(richTextContent);
    const textForClaude = knownAmounts + cleanedText;

    const { recipe: parsed } = await parseRecipeFromText(textForClaude, "url", url, jsonLd ?? undefined, titleHint ?? undefined);
    const { recipe: reviewed } = await reviewAndImproveRecipe(parsed);

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
