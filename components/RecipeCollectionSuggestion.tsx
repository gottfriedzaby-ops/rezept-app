"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CollectionIcon } from "@/lib/collection-icons";
import { iconKeyForCollectionName, type SmartCollectionKey } from "@/lib/collection-suggestions";

interface RecipeCollectionSuggestionProps {
  recipeId: string;
  smartKey: SmartCollectionKey;
}

interface PickerCollection {
  id: string;
  name: string;
  contains_recipe: boolean;
}

type Phase = "checking" | "visible" | "hidden" | "done";

/**
 * Post-Import-Vorschlag auf der Rezept-Detailseite: bietet an, das Rezept mit
 * einem Tippen in die passende kanonische Sammlung zu legen. Blendet sich aus,
 * wenn das Rezept bereits in einer dazu passenden Sammlung liegt (kein Nerven).
 */
export default function RecipeCollectionSuggestion({
  recipeId,
  smartKey,
}: RecipeCollectionSuggestionProps) {
  const t = useTranslations("CollectionSuggestions");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("checking");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/collections?recipe_id=${recipeId}`);
        if (!res.ok) {
          if (active) setPhase("hidden");
          return;
        }
        const body = await res.json();
        const collections = (body.data as PickerCollection[]) ?? [];
        const alreadyCollected = collections.some(
          (c) => c.contains_recipe && iconKeyForCollectionName(c.name) === smartKey
        );
        if (active) setPhase(alreadyCollected ? "hidden" : "visible");
      } catch {
        if (active) setPhase("hidden");
      }
    })();
    return () => {
      active = false;
    };
  }, [recipeId, smartKey]);

  async function add() {
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/collections/suggestions/add-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: smartKey, recipe_id: recipeId, locale }),
      });
      if (!res.ok) {
        setError(t("applyError"));
        return;
      }
      setPhase("done");
    } catch {
      setError(t("applyError"));
    } finally {
      setAdding(false);
    }
  }

  if (phase === "checking" || phase === "hidden") return null;

  const name = t(`categories.${smartKey}.name`);

  if (phase === "done") {
    return (
      <p className="mt-3 inline-flex items-center gap-2 text-sm text-forest">
        <CollectionIcon smartKey={smartKey} className="w-4 h-4" />
        {t("added", { name })}
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-stone bg-surface-secondary px-4 py-2.5">
      <CollectionIcon smartKey={smartKey} className="w-5 h-5 text-forest shrink-0" />
      <span className="text-sm text-ink-secondary flex-1 min-w-0">
        {t("afterImportPrompt", { name })}
      </span>
      <button
        type="button"
        onClick={add}
        disabled={adding}
        className="btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {adding ? t("adding") : t("addToCollection")}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
