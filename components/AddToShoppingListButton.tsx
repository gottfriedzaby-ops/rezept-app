"use client";

import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { addRecipeItems } from "@/lib/shopping-list";

interface AddToShoppingListButtonProps {
  recipe: Recipe;
}

export default function AddToShoppingListButton({ recipe }: AddToShoppingListButtonProps) {
  const defaultServings = recipe.servings ?? 4;
  const [modalOpen, setModalOpen] = useState(false);
  const [desiredServings, setDesiredServings] = useState(defaultServings);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const sections = getRecipeSections(recipe);
  const allIngredients = sections.flatMap((s) => s.ingredients);
  const firstIngredient = allIngredients[0] ?? null;

  function getPreviewText(): string {
    if (!firstIngredient) return "";
    const scaled =
      firstIngredient.amount > 0 && recipe.servings != null && recipe.servings > 0
        ? Math.round((firstIngredient.amount * desiredServings) / recipe.servings * 10) / 10
        : firstIngredient.amount;
    const parts: string[] = [];
    if (scaled != null && scaled > 0) parts.push(String(scaled));
    if (firstIngredient.unit) parts.push(firstIngredient.unit);
    parts.push(firstIngredient.name);
    return `z.B. ${parts.join(" ")}`;
  }

  function handleOpen() {
    setDesiredServings(defaultServings);
    setModalOpen(true);
  }

  function handleConfirm() {
    const count = addRecipeItems(
      { id: recipe.id, title: recipe.title, servings: recipe.servings },
      allIngredients,
      desiredServings
    );
    setModalOpen(false);
    setToastMessage(`${count} Zutaten zur Einkaufsliste hinzugefügt`);
    setTimeout(() => setToastMessage(null), 3000);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded border border-stone text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        Zur Einkaufsliste
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative bg-white rounded-lg shadow-lg border border-stone p-6 max-w-sm w-full mx-4">
            <h2 className="font-serif text-lg font-medium text-ink-primary mb-5">
              Zur Einkaufsliste hinzufügen
            </h2>

            <div className="mb-4">
              <label
                htmlFor="servings-input"
                className="block text-sm font-medium text-ink-secondary mb-2"
              >
                Portionen
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDesiredServings((v) => Math.max(1, v - 1))}
                  className="w-9 h-9 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors text-lg leading-none"
                  aria-label="Portionen verringern"
                >
                  −
                </button>
                <input
                  id="servings-input"
                  type="number"
                  min={1}
                  max={20}
                  value={desiredServings}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1 && val <= 20) setDesiredServings(val);
                  }}
                  className="w-16 text-center px-2 py-2 text-sm bg-white border border-stone rounded text-ink-primary focus:outline-none focus:border-ink-secondary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setDesiredServings((v) => Math.min(20, v + 1))}
                  className="w-9 h-9 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors text-lg leading-none"
                  aria-label="Portionen erhöhen"
                >
                  +
                </button>
              </div>
            </div>

            {firstIngredient && (
              <p className="text-sm text-ink-tertiary mb-6">{getPreviewText()}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-ghost flex-1"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="btn-primary flex-1"
              >
                Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-primary text-white text-sm px-4 py-2.5 rounded-lg shadow-lg pointer-events-none">
          {toastMessage}
        </div>
      )}
    </>
  );
}
