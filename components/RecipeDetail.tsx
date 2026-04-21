"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/types/recipe";

function formatAmount(amountPerServing: number, servings: number): string {
  const total = amountPerServing * servings;
  if (total <= 0) return "";
  const rounded = Math.round(total * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

export default function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const [servings, setServings] = useState(recipe.servings ?? 1);

  return (
    <>
      <div className="flex items-center gap-3 my-6 border-t border-b border-gray-100 py-4">
        <span className="text-sm font-medium text-gray-700">Portionen</span>
        <button
          onClick={() => setServings((s) => Math.max(1, s - 1))}
          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-lg leading-none"
          aria-label="Weniger Portionen"
        >
          −
        </button>
        <span className="text-xl font-bold w-8 text-center tabular-nums">{servings}</span>
        <button
          onClick={() => setServings((s) => s + 1)}
          className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-lg leading-none"
          aria-label="Mehr Portionen"
        >
          +
        </button>
      </div>

      <Link
        href={`/${recipe.id}/cook?servings=${servings}`}
        className="flex items-center justify-center h-16 w-full rounded-xl bg-orange-500 text-white text-lg font-semibold hover:bg-orange-600 mb-8"
      >
        Jetzt kochen →
      </Link>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Zutaten</h2>
        <ul className="space-y-1.5">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="text-sm flex gap-2">
              {ing.amount > 0 && (
                <span className="font-medium tabular-nums min-w-[4rem] shrink-0">
                  {formatAmount(ing.amount, servings)}
                  {ing.unit ? ` ${ing.unit}` : ""}
                </span>
              )}
              <span>{ing.name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Zubereitung</h2>
        <ol className="space-y-6">
          {recipe.steps.map((step, i) => {
            const imgUrl = recipe.step_images?.[i];
            return (
              <li key={step.order} className="flex gap-4">
                <span className="font-bold text-gray-400 text-sm mt-0.5 w-5 shrink-0">
                  {step.order}.
                </span>
                <div className="flex-1 text-sm">
                  <p>
                    {step.text}
                    {step.timerSeconds ? (
                      <span className="ml-2 text-xs text-gray-400">
                        ({Math.round(step.timerSeconds / 60)} Min.)
                      </span>
                    ) : null}
                  </p>
                  {imgUrl && (
                    <img
                      src={imgUrl}
                      alt={`Schritt ${step.order}`}
                      className="mt-3 rounded-lg max-w-xs w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
