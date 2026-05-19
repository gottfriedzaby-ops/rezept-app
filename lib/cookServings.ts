/**
 * Resolve the servings count for cook mode.
 *
 * Priority:
 *   1. The explicit `?servings=` query the detail page passes when the user
 *      hits "Jetzt kochen" (so the cook screen inherits any adjustment they
 *      made on detail).
 *   2. The recipe's configured `servings` — used when the user opens the
 *      cook URL directly (bookmark, refresh, deep link).
 *   3. 1 — last-resort floor.
 *
 * Negative, zero, NaN, or missing values are ignored at every step.
 */
export function resolveCookServings(
  queryServings: string | undefined,
  recipeServings: number | null | undefined
): number {
  const parsed = parseInt(queryServings ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (recipeServings && recipeServings > 0) return recipeServings;
  return 1;
}
