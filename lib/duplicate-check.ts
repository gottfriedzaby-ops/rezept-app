import { supabaseAdmin } from "@/lib/supabase";

export interface DuplicateResult {
  existingRecipeId: string;
  existingTitle: string;
}

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.toLowerCase());
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    // Strip common tracking and session params
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

export async function findDuplicateRecipe(
  title: string,
  sourceValue: string
): Promise<DuplicateResult | null> {
  // 1. Exact source_value match
  const { data: exact } = await supabaseAdmin
    .from("recipes")
    .select("id, title")
    .eq("source_value", sourceValue)
    .maybeSingle();
  if (exact) return { existingRecipeId: exact.id, existingTitle: exact.title };

  // 2. Normalised URL match — catches trailing slash, utm params, http vs https
  if (sourceValue.startsWith("http")) {
    const normalizedSource = normalizeUrl(sourceValue);
    let hostname = "";
    try {
      hostname = new URL(sourceValue).hostname;
    } catch { /* skip */ }

    if (hostname) {
      const { data: urlCandidates } = await supabaseAdmin
        .from("recipes")
        .select("id, title, source_value")
        .ilike("source_value", `%${hostname}%`);

      if (urlCandidates) {
        for (const row of urlCandidates) {
          if (normalizeUrl(row.source_value) === normalizedSource) {
            return { existingRecipeId: row.id, existingTitle: row.title };
          }
        }
      }
    }
  }

  // 3. Fuzzy title match — search for recipes sharing the most distinctive word,
  //    then compute Jaccard similarity and flag if ≥ 85 %
  const titleWords = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .sort((a, b) => b.length - a.length); // longest (= most distinctive) first

  if (titleWords.length > 0) {
    const { data: titleCandidates } = await supabaseAdmin
      .from("recipes")
      .select("id, title")
      .ilike("title", `%${titleWords[0]}%`)
      .limit(20);

    if (titleCandidates) {
      for (const candidate of titleCandidates) {
        if (titleSimilarity(title, candidate.title) >= 0.85) {
          return { existingRecipeId: candidate.id, existingTitle: candidate.title };
        }
      }
    }
  }

  return null;
}
