"use client";

import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { cookTimeLabelFor, recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import { getTagColor } from "@/lib/tag-colors";
import { formatScaledAmount as formatAmount, resolveStepText } from "@/lib/stepText";

// Read-only recipe view for offline use. Hardcoded German (the /offline route
// has no next-intl provider, matching the rest of the offline fallback) and no
// links to server-rendered routes (cook mode, sharing) that need a connection.
export default function OfflineRecipeView({ recipe }: { recipe: Recipe }) {
  const [servings, setServings] = useState(recipe.servings ?? 1);
  const minServings = recipe.scalable === false ? (recipe.servings ?? 1) : 1;

  const sections = getRecipeSections(recipe);
  const showSectionHeaders = sections.length > 1 || sections[0]?.title !== null;
  const badge = recipeTypeBadgeFor(recipe.recipe_type ?? "kochen");
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);

  return (
    <article>
      {recipe.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.image_url}
          alt={recipe.title}
          className="w-full max-h-72 object-cover rounded-lg mb-6"
          loading="lazy"
        />
      )}

      <h1 className="font-serif text-[2rem] font-medium text-ink-primary tracking-[-0.02em] leading-tight break-words mb-4">
        {recipe.title}
      </h1>

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
        {recipe.servings ? <span>{recipe.servings} Portionen</span> : null}
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        <span className="text-xs px-2.5 py-0.5 rounded bg-surface-secondary text-ink-secondary border border-stone">
          {badge.emoji} {badge.label}
        </span>
        {recipe.tags.map((tag) => {
          const { bg, text } = getTagColor(tag);
          return (
            <span key={tag} style={{ backgroundColor: bg, color: text }} className="text-xs px-2.5 py-0.5 rounded">
              {tag}
            </span>
          );
        })}
      </div>

      {recipe.description && (
        <p className="text-sm text-ink-secondary leading-relaxed mb-2">{recipe.description}</p>
      )}

      {/* Servings stepper */}
      <div className="mt-8 pt-8 border-t border-stone">
        <div className="flex items-center justify-between">
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
      </div>

      {/* Sections: ingredients + steps */}
      {sections.map((section, sIdx) => (
        <div key={sIdx}>
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
                const globalStepIndex =
                  sections.slice(0, sIdx).reduce((acc, s) => acc + s.steps.length, 0) + i;
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
                        // eslint-disable-next-line @next/next/no-img-element
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
    </article>
  );
}
