import { supabaseAdmin } from "@/lib/supabase";
import type { SourceType } from "@/types/recipe";

export interface DuplicateResult {
  existingRecipeId: string;
  existingTitle: string;
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.toLowerCase());
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "s",
    ];
    trackingParams.forEach((p) => u.searchParams.delete(p));
    u.hash = "";
    u.searchParams.sort();
    return u.toString();
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

// Jaccard similarity on word sets — good enough for recipe titles
function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s]/g, "")
      .split(/\s+/)
      .filter(Boolean);
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  const intersection = Array.from(wordsA).filter((w) => wordsB.has(w)).length;
  const union = new Set([...Array.from(wordsA), ...Array.from(wordsB)]).size;
  return intersection / union;
}

// Fast URL-only check — run this before any expensive processing to short-circuit
// duplicate imports without triggering Claude API calls.
// Both stage queries are fired concurrently; results are still evaluated in
// precedence order (exact source_value before normalised URL).
export async function checkUrlDuplicate(url: string, userId: string): Promise<DuplicateResult | null> {
  let hostname = "";
  if (url.startsWith("http")) {
    try { hostname = new URL(url).hostname; } catch { /* skip */ }
  }

  const [{ data: exact }, urlCandidatesResult] = await Promise.all([
    supabaseAdmin
      .from("recipes")
      .select("id, title")
      .eq("source_value", url)
      .eq("user_id", userId)
      .maybeSingle(),
    hostname
      ? supabaseAdmin
          .from("recipes")
          .select("id, title, source_value")
          .eq("user_id", userId)
          .ilike("source_value", `%${hostname}%`)
      : Promise.resolve({ data: null }),
  ]);

  if (exact) return { existingRecipeId: exact.id, existingTitle: exact.title };

  if (urlCandidatesResult.data) {
    const normalizedSource = normalizeUrl(url);
    for (const row of urlCandidatesResult.data) {
      if (normalizeUrl(row.source_value) === normalizedSource) {
        return { existingRecipeId: row.id, existingTitle: row.title };
      }
    }
  }

  return null;
}

export async function findDuplicateRecipe(
  title: string,
  sourceValue: string,
  userId: string,
  sourceType?: SourceType
): Promise<DuplicateResult | null> {
  // PDF imports store a filename as source_value. Stages 1 (exact source_value)
  // and 2 (normalised URL) are meaningless for filenames and would false-positive
  // on collisions (two different "rezept.pdf"), so skip them — run only stage 3.
  const skipSourceStages = sourceType === "pdf";

  let hostname = "";
  if (!skipSourceStages && sourceValue.startsWith("http")) {
    try {
      hostname = new URL(sourceValue).hostname;
    } catch { /* skip */ }
  }

  // Stage 3 candidate word: recipes sharing the most distinctive title word
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .sort((a, b) => b.length - a.length); // longest (= most distinctive) first

  // All applicable stage queries run concurrently; results are evaluated
  // strictly in precedence order below (exact → normalised URL → fuzzy title).
  const noRows = Promise.resolve({ data: null });
  const [exactResult, urlCandidatesResult, titleCandidatesResult] = await Promise.all([
    skipSourceStages
      ? noRows
      : supabaseAdmin
          .from("recipes")
          .select("id, title")
          .eq("source_value", sourceValue)
          .eq("user_id", userId)
          .maybeSingle(),
    hostname
      ? supabaseAdmin
          .from("recipes")
          .select("id, title, source_value")
          .eq("user_id", userId)
          .ilike("source_value", `%${hostname}%`)
      : noRows,
    titleWords.length > 0
      ? supabaseAdmin
          .from("recipes")
          .select("id, title")
          .eq("user_id", userId)
          .ilike("title", `%${titleWords[0]}%`)
          .limit(20)
      : noRows,
  ]);

  // 1. Exact source_value match
  const exact = exactResult.data as { id: string; title: string } | null;
  if (exact) return { existingRecipeId: exact.id, existingTitle: exact.title };

  // 2. Normalised URL match
  if (urlCandidatesResult.data) {
    const normalizedSource = normalizeUrl(sourceValue);
    const urlCandidates = urlCandidatesResult.data as Array<{ id: string; title: string; source_value: string }>;
    for (const row of urlCandidates) {
      if (normalizeUrl(row.source_value) === normalizedSource) {
        return { existingRecipeId: row.id, existingTitle: row.title };
      }
    }
  }

  // 3. Fuzzy title match — Jaccard similarity ≥ 85 %
  if (titleCandidatesResult.data) {
    const titleCandidates = titleCandidatesResult.data as Array<{ id: string; title: string }>;
    for (const candidate of titleCandidates) {
      if (titleSimilarity(title, candidate.title) >= 0.85) {
        return { existingRecipeId: candidate.id, existingTitle: candidate.title };
      }
    }
  }

  return null;
}
