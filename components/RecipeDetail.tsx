"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import { Link } from "@/i18n/navigation";
import type { Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { formatScaledAmount as formatAmount, resolveStepText } from "@/lib/stepText";

const ctaKeys = {
  kochen: 'ctaKochen',
  backen: 'ctaBacken',
  grillen: 'ctaGrillen',
  zubereiten: 'ctaZubereiten',
} as const;

export default function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const t = useTranslations('RecipeDetail');
  const tTypes = useTranslations('RecipeTypes');
  const [servings, setServings] = useState(recipe.servings ?? 1);
  const minServings = recipe.scalable === false ? (recipe.servings ?? 1) : 1;

  const sections = getRecipeSections(recipe);
  const showSectionHeaders = sections.length > 1 || sections[0]?.title !== null;
  const recipeType = (recipe.recipe_type ?? 'kochen') as keyof typeof ctaKeys;
  const ctaLabel = tTypes(ctaKeys[recipeType] ?? ctaKeys.kochen);

  return (
    <>
      {/* Servings + Cook button */}
      <div className="mt-10 pt-8 border-t border-stone">
        <div className="flex items-center justify-between mb-6">
          <span className="label-overline">{t('servings')}</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setServings((s) => Math.max(minServings, s - 1))}
              disabled={servings <= minServings}
              className="w-8 h-8 rounded border border-stone flex items-center justify-center text-ink-secondary hover:bg-surface-hover transition-colors text-base leading-none disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={t('lessServings')}
            >
              −
            </button>
            <span className="text-xl font-medium text-ink-primary w-6 text-center tabular-nums">
              {servings}
            </span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-8 h-8 rounded border border-stone flex items-center justify-center text-ink-secondary hover:bg-surface-hover transition-colors text-base leading-none"
              aria-label={t('moreServings')}
            >
              +
            </button>
          </div>
        </div>

        {recipe.scalable === false && servings <= minServings && (
          <p className="text-xs text-ink-tertiary mb-4">
            {t('scalingNotice', { count: minServings, plural: minServings !== 1 ? 'en' : '' })}
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
          <h2 className="label-overline mb-6">{t('allIngredients')}</h2>
          {sections.map((section, sIdx) => (
            <div key={sIdx}>
              {section.title && (
                <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mt-4 mb-1">
                  {section.title}
                </p>
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
              <h2 className="label-overline mb-6">{t('ingredients')}</h2>
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
              <h2 className="label-overline mb-6">{t('preparation')}</h2>
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
                        {resolveStepText(step.text, section.ingredients, servings)}
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
