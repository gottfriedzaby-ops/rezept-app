"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import type { MealPlanRecipe } from "@/types/meal-plan";

const MAX_RESULTS = 50;

interface MealPlanRecipePickerProps {
  recipes: MealPlanRecipe[];
  onPick: (recipe: MealPlanRecipe) => void;
  onClose: () => void;
}

export default function MealPlanRecipePicker({
  recipes,
  onPick,
  onClose,
}: MealPlanRecipePickerProps) {
  const t = useTranslations("MealPlan");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? recipes.filter((recipe) => recipe.title.toLowerCase().includes(q))
      : recipes;
    return matches.slice(0, MAX_RESULTS);
  }, [recipes, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-plan-picker-title"
        className="relative bg-surface-card rounded-lg shadow-lg border border-stone p-6 max-w-sm w-full mx-4 max-h-[80vh] flex flex-col"
      >
        <h2
          id="meal-plan-picker-title"
          className="font-serif text-lg font-medium text-ink-primary mb-4"
        >
          {t("pickerTitle")}
        </h2>

        {recipes.length === 0 ? (
          <p className="text-sm text-ink-secondary">{t("noRecipesYet")}</p>
        ) : (
          <>
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
              }}
              placeholder={t("searchPlaceholder")}
              className="input-field mb-4"
            />

            {filtered.length === 0 ? (
              <p className="text-sm text-ink-tertiary">{t("noRecipesFound")}</p>
            ) : (
              <ul className="overflow-y-auto -mx-2 px-2 space-y-1">
                {filtered.map((recipe) => {
                  const badge = recipeTypeBadgeFor(recipe.recipe_type ?? "kochen");
                  return (
                    <li key={recipe.id}>
                      <button
                        type="button"
                        onClick={() => onPick(recipe)}
                        className="w-full flex items-center gap-3 text-left px-3 py-2 rounded hover:bg-surface-hover transition-colors"
                      >
                        <span aria-hidden="true" className="shrink-0">
                          {badge.emoji}
                        </span>
                        <span className="text-sm text-ink-primary leading-snug line-clamp-2">
                          {recipe.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
