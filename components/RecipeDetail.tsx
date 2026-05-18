"use client";

import { useState } from "react";
import Link from "next/link";
import type { Ingredient, Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { ctaLabelFor, cookTimeLabelFor } from "@/lib/recipeTypeLabels";

// FR-81 + FR-07-2: per-ingredient non-scalable rule.
// `amount === null` (parser stored a quantity word like "Prise" without a count)
// OR `unit === ""` (integer count like "1 Lorbeerblatt") → do NOT multiply by servings.
// Returns the complete "amount unit" string (or just one of them); empty string means hide the cell.
function renderIngredientAmount(
  amount: number | null,
  unit: string,
  servings: number
): string {
  if (amount == null) return unit; // "Prise" — no numeric quantity to display
  if (amount <= 0) return unit;
  const scale = unit === "" ? 1 : servings;
  const total = amount * scale;
  if (total <= 0) return unit;
  const rounded = Math.round(total * 10) / 10;
  const amountStr = rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
  return unit ? `${amountStr} ${unit}` : amountStr;
}

function IngredientRow({ ing, servings }: { ing: Ingredient; servings: number }) {
  const text = renderIngredientAmount(ing.amount, ing.unit, servings);
  return (
    <li className="flex gap-4 text-sm">
      {text && (
        <span className="font-medium text-ink-primary tabular-nums w-20 shrink-0">{text}</span>
      )}
      <span className="text-ink-secondary">{ing.name}</span>
    </li>
  );
}

export default function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const [servings, setServings] = useState(recipe.servings ?? 1);
  const minServings = recipe.scalable === false ? (recipe.servings ?? 1) : 1;

  const sections = getRecipeSections(recipe);
  const showSectionHeaders = sections.length > 1 || sections[0]?.title !== null;
  const ctaLabel = ctaLabelFor(recipe.recipe_type ?? "kochen");
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <>
      {/* Meta row — only the "X Portionen" cell syncs with the scaler (FR-81 scope).
          Prep and cook times remain constant: cooking time is not linearly scalable. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-secondary mb-4">
        {recipe.prep_time ? <span>Vorbereitung {recipe.prep_time} Min.</span> : null}
        {recipe.cook_time ? (
          <span>
            {cookTimeLabelFor(recipe.recipe_type ?? "kochen")} {recipe.cook_time} Min.
          </span>
        ) : null}
        {totalTime > 0 ? (
          <span className="text-ink-primary font-medium">Gesamt {totalTime} Min.</span>
        ) : null}
        <span>
          {servings} {servings === 1 ? "Portion" : "Portionen"}
        </span>
      </div>

      {/* Servings + Cook button */}
      <div className="mt-10 pt-8 border-t border-stone">
        <div className="flex items-center justify-between mb-6">
          <span className="label-overline">Portionen</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setServings((s) => Math.max(minServings, s - 1))}
              disabled={servings <= minServings}
              className="w-8 h-8 rounded border border-stone flex items-center justify-center text-ink-secondary hover:bg-surface-hover transition-colors text-base leading-none disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Weniger Portionen"
            >
              −
            </button>
            <span className="text-xl font-medium text-ink-primary w-6 text-center tabular-nums">
              {servings}
            </span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-8 h-8 rounded border border-stone flex items-center justify-center text-ink-secondary hover:bg-surface-hover transition-colors text-base leading-none"
              aria-label="Mehr Portionen"
            >
              +
            </button>
          </div>
        </div>

        {recipe.scalable === false && servings <= minServings && (
          <p className="text-xs text-ink-tertiary mb-4">
            Dieses Rezept ist für {minServings} Portion{minServings !== 1 ? "en" : ""} ausgelegt und kann nicht weiter reduziert werden.
          </p>
        )}

        <Link
          href={`/${recipe.id}/cook?servings=${servings}`}
          className="flex items-center justify-center w-full py-4 bg-forest text-white font-medium rounded hover:bg-forest-deep transition-colors"
        >
          {ctaLabel} →
        </Link>
      </div>

      {/* All-ingredients summary — only for multi-section recipes */}
      {showSectionHeaders && (
        <section className="mt-12">
          <h2 className="label-overline mb-6">Alle Zutaten</h2>
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {section.title && (
                <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mt-4 mb-1">
                  {section.title}
                </p>
              )}
              <ul className="space-y-3">
                {section.ingredients.map((ing, i) => (
                  <IngredientRow key={i} ing={ing} servings={servings} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Sections — ingredients + steps per section */}
      {sections.map((section, sIdx) => (
        <div key={sIdx}>
          {/* Section header — only shown for multi-section or named sections */}
          {showSectionHeaders && section.title && (
            <h3 className="font-serif text-lg font-medium text-ink-primary mt-12 mb-2 pb-2 border-b border-stone">
              {section.title}
            </h3>
          )}

          <section className={showSectionHeaders && section.title ? "mt-6" : "mt-12"}>
            {(showSectionHeaders || sIdx === 0) && (
              <h2 className="label-overline mb-6">Zutaten</h2>
            )}
            <ul className="space-y-3">
              {section.ingredients.map((ing, i) => (
                <IngredientRow key={i} ing={ing} servings={servings} />
              ))}
            </ul>
          </section>

          <section className="mt-8">
            {(!showSectionHeaders || sIdx === 0) && (
              <h2 className="label-overline mb-6">Zubereitung</h2>
            )}
            <ol className="space-y-8">
              {section.steps.map((step, i) => {
                const globalStepIndex = sections
                  .slice(0, sIdx)
                  .reduce((acc, s) => acc + s.steps.length, 0) + i;
                const imgUrl = recipe.step_images?.[globalStepIndex];
                return (
                  <li key={step.order} className="flex gap-6">
                    <span className="font-medium text-ink-tertiary text-sm mt-0.5 w-5 shrink-0 tabular-nums">
                      {step.order}.
                    </span>
                    <div className="flex-1">
                      <p className="text-ink-primary leading-relaxed">
                        {step.text}
                        {step.timerSeconds ? (
                          <span className="ml-2 text-xs text-ink-tertiary">
                            ({Math.round(step.timerSeconds / 60)} Min.)
                          </span>
                        ) : null}
                      </p>
                      {imgUrl && (
                        <img
                          src={imgUrl}
                          alt={`Schritt ${step.order}`}
                          className="mt-4 rounded max-w-sm w-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      ))}
    </>
  );
}
