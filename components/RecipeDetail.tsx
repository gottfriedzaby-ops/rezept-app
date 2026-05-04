"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { ctaLabelFor } from "@/lib/recipeTypeLabels";

function formatAmount(amountPerServing: number, servings: number): string {
  const total = amountPerServing * servings;
  if (total <= 0) return "";
  const rounded = Math.round(total * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

export default function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const [servings, setServings] = useState(recipe.servings ?? 1);
  const minServings = recipe.scalable === false ? (recipe.servings ?? 1) : 1;

  const sections = getRecipeSections(recipe);
  const showSectionHeaders = sections.length > 1 || sections[0]?.title !== null;
  const ctaLabel = ctaLabelFor(recipe.recipe_type ?? "kochen");

  return (
    <>
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
            {(!showSectionHeaders || sIdx === 0) && (
              <h2 className="label-overline mb-6">Zutaten</h2>
            )}
            <ul className="space-y-3">
              {section.ingredients.map((ing, i) => (
                <li key={i} className="flex gap-4 text-sm">
                  {ing.amount > 0 && (
                    <span className="font-medium text-ink-primary tabular-nums w-20 shrink-0">
                      {formatAmount(ing.amount, servings)}
                      {ing.unit ? ` ${ing.unit}` : ""}
                    </span>
                  )}
                  <span className="text-ink-secondary">{ing.name}</span>
                </li>
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
