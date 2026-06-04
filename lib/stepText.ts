import type { Ingredient } from "@/types/recipe";

// Matches an ingredient placeholder inside a cooking step, e.g. "{{Mehl}}".
// The inner text is the ingredient's name as it appears in the ingredient list.
const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/**
 * Scale a per-serving amount to the requested servings and format it for display.
 * Returns "" when the scaled amount is not a positive number (e.g. "nach Bedarf"
 * ingredients stored with amount 0), so callers can drop the quantity entirely.
 */
export function formatScaledAmount(perServing: number, servings: number): string {
  const total = perServing * servings;
  if (!Number.isFinite(total) || total <= 0) return "";
  const rounded = Math.round(total * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

function findIngredient(name: string, ingredients: Ingredient[]): Ingredient | undefined {
  const target = name.trim().toLowerCase();
  if (!target) return undefined;
  // Exact (case-insensitive) match first, then a lenient containment match so
  // minor wording differences between step and list still resolve.
  return (
    ingredients.find((i) => i.name.trim().toLowerCase() === target) ??
    ingredients.find((i) => {
      const n = i.name.trim().toLowerCase();
      return n.length > 0 && (n.includes(target) || target.includes(n));
    })
  );
}

/**
 * Expand {{ingredient name}} placeholders in a cooking step into the live, scaled
 * quantity, e.g. "{{Mehl}} unterrühren" → "200 g Mehl unterrühren".
 *
 * Step text never stores literal amounts: the quantity is looked up from the
 * recipe's ingredient list (amounts are stored per serving) and multiplied by the
 * requested servings, so a step always shows the amount needed for the scaled
 * recipe. A placeholder expands to "<amount> <unit> <name>"; when the ingredient
 * has no positive amount only the name is shown, and an unknown ingredient falls
 * back to the placeholder's literal inner text so the step stays readable.
 */
export function resolveStepText(
  text: string,
  ingredients: Ingredient[],
  servings: number,
): string {
  if (!text || text.indexOf("{{") === -1) return text;
  return text.replace(PLACEHOLDER_RE, (_match, rawName: string) => {
    const ing = findIngredient(rawName, ingredients);
    const label = (ing?.name ?? rawName).trim();
    if (!ing) return label;
    const amount = formatScaledAmount(ing.amount, servings);
    if (!amount) return label;
    const unit = ing.unit?.trim();
    return unit ? `${amount} ${unit} ${label}` : `${amount} ${label}`;
  });
}
