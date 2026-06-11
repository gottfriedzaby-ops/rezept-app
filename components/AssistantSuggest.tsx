"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import { addRecipeItems, notifyListChanged } from "@/lib/shopping-list";
import { useToast } from "@/contexts/ToastContext";
import { getTagColor } from "@/lib/tag-colors";
import type { RecipeType } from "@/types/recipe";

interface SuggestionRecipe {
  id: string;
  title: string;
  tags: string[];
  recipe_type: RecipeType | null;
  image_url: string | null;
  total_time: number;
  servings: number | null;
}

interface Suggestion {
  recipe: SuggestionRecipe;
  reason: string;
  missing: string[];
}

type Phase = "idle" | "loading" | "done" | "error";

export default function AssistantSuggest() {
  const t = useTranslations("Assistant");
  const tList = useTranslations("RecipeList");
  const { showToast } = useToast();

  const [pantry, setPantry] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  async function submit() {
    const text = pantry.trim();
    if (text.length < 3 || phase === "loading") return;
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/assistant/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pantry: text }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) {
        setError(json?.error ?? t("errorGeneric"));
        setPhase("error");
        return;
      }
      setSuggestions(json.data.suggestions as Suggestion[]);
      setPhase("done");
    } catch {
      setError(t("errorGeneric"));
      setPhase("error");
    }
  }

  function addMissing(suggestion: Suggestion) {
    if (suggestion.missing.length === 0) return;
    const count = addRecipeItems(
      { id: suggestion.recipe.id, title: suggestion.recipe.title, servings: null },
      suggestion.missing.map((name) => ({ amount: 0, unit: "", name })),
      1
    );
    notifyListChanged();
    showToast(t("missingAddedToast", { count }));
  }

  return (
    <div>
      <label htmlFor="pantry-input" className="block text-sm font-medium text-ink-secondary mb-2">
        {t("pantryLabel")}
      </label>
      <textarea
        id="pantry-input"
        value={pantry}
        onChange={(e) => setPantry(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        rows={3}
        maxLength={1000}
        placeholder={t("pantryPlaceholder")}
        className="input-field min-h-[5rem] resize-y"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pantry.trim().length < 3 || phase === "loading"}
        className="btn-primary mt-3"
      >
        {phase === "loading" ? t("loading") : t("submit")}
      </button>

      {phase === "error" && error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {phase === "loading" && (
        <div className="mt-8 space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-surface-secondary animate-pulse" />
          ))}
        </div>
      )}

      {phase === "done" && suggestions.length === 0 && (
        <p className="mt-8 text-sm text-ink-secondary">{t("noSuggestions")}</p>
      )}

      {phase === "done" && suggestions.length > 0 && (
        <ul className="mt-8 space-y-4">
          {suggestions.map(({ recipe, reason, missing }) => {
            const badge = recipeTypeBadgeFor(recipe.recipe_type ?? "kochen");
            return (
              <li
                key={recipe.id}
                className="border border-stone rounded-lg bg-surface-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-serif text-lg font-medium text-ink-primary leading-snug">
                      <span aria-hidden="true" className="mr-1.5">{badge.emoji}</span>
                      {recipe.title}
                    </h3>
                    <p className="text-xs text-ink-tertiary mt-1">
                      {[
                        recipe.total_time > 0
                          ? tList("totalTime", { time: recipe.total_time })
                          : null,
                        recipe.servings
                          ? tList("portionen", { count: recipe.servings })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Link
                    href={`/${recipe.id}`}
                    className="text-sm font-medium text-forest hover:text-forest-deep transition-colors shrink-0"
                  >
                    {t("openRecipe")}
                  </Link>
                </div>

                {reason && (
                  <p className="text-sm text-ink-secondary mt-3">{reason}</p>
                )}

                {missing.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-ink-tertiary">{t("missingLabel")}</span>
                    {missing.map((name) => {
                      const { bg, text } = getTagColor(name);
                      return (
                        <span
                          key={name}
                          style={{ backgroundColor: bg, color: text }}
                          className="text-xs px-2 py-0.5 rounded"
                        >
                          {name}
                        </span>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => addMissing({ recipe, reason, missing })}
                      className="text-xs px-3 py-1 rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
                    >
                      {t("addMissing")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
