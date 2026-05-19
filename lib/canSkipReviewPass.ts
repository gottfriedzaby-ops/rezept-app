/**
 * AO-12-1: skip the Claude review pass for a URL import when the source
 * provided rich schema.org JSON-LD and the parse-pass output passes a
 * structural soundness check.
 *
 * Rationale: when JSON-LD has both `recipeIngredient` and `recipeInstructions`,
 * the parse pass is mostly a direct transcription. The review pass exists to
 * recover from messy HTML extraction (missing ingredients, garbled steps).
 * For solid JSON-LD input, the review call is redundant — skipping it cuts
 * one Claude call per import (~50% of API cost for the URL path).
 *
 * Loss when skipped: ingredient-completeness cross-check vs. step text, step
 * quality refinements, tag refinement. These are not free, but the parse pass
 * already produces German output (it's instructed to translate inline), so
 * recipes don't ship in the wrong language when review is skipped.
 */

import type { ParsedRecipe } from "@/types/recipe";
import type { JsonLdRecipeData } from "@/lib/claude";

export interface SkipDecision {
  skip: boolean;
  /** Stable identifier for log/metrics correlation. */
  reason:
    | "jsonld-and-parse-pass-look-solid"
    | "no-jsonld"
    | "jsonld-missing-ingredients"
    | "jsonld-missing-instructions"
    | "parse-pass-missing-servings"
    | "parse-pass-empty-sections"
    | "parse-pass-section-missing-content";
}

function jsonLdInstructionCount(jsonLd: JsonLdRecipeData): number {
  const ins = jsonLd.recipeInstructions;
  if (!Array.isArray(ins)) return 0;
  return ins.filter((step) => {
    if (typeof step === "string") return step.trim().length > 0;
    if (step && typeof step === "object") return (step.text ?? step.name ?? "").trim().length > 0;
    return false;
  }).length;
}

function jsonLdIngredientCount(jsonLd: JsonLdRecipeData): number {
  const ing = jsonLd.recipeIngredient;
  if (!Array.isArray(ing)) return 0;
  return ing.filter((s) => typeof s === "string" && s.trim().length > 0).length;
}

export function decideSkipReviewPass(
  parsed: ParsedRecipe,
  jsonLd: JsonLdRecipeData | null | undefined
): SkipDecision {
  if (!jsonLd) return { skip: false, reason: "no-jsonld" };

  if (jsonLdIngredientCount(jsonLd) < 1) {
    return { skip: false, reason: "jsonld-missing-ingredients" };
  }
  if (jsonLdInstructionCount(jsonLd) < 1) {
    return { skip: false, reason: "jsonld-missing-instructions" };
  }

  if (!parsed.servings || parsed.servings <= 0) {
    return { skip: false, reason: "parse-pass-missing-servings" };
  }

  const sections = parsed.sections ?? [];
  if (sections.length === 0) {
    return { skip: false, reason: "parse-pass-empty-sections" };
  }

  for (const s of sections) {
    const hasIngredient = s.ingredients.some((i) => i.name.trim().length > 0);
    const hasStep = s.steps.some((st) => st.text.trim().length > 0);
    if (!hasIngredient || !hasStep) {
      return { skip: false, reason: "parse-pass-section-missing-content" };
    }
  }

  return { skip: true, reason: "jsonld-and-parse-pass-look-solid" };
}
