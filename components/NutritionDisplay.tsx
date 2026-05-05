"use client";

import { useState } from "react";
import type { Recipe } from "@/types/recipe";

interface Props {
  recipe: Recipe;
}

export default function NutritionDisplay({ recipe }: Props) {
  const [kcal, setKcal] = useState(recipe.kcal_per_serving);
  const [protein, setProtein] = useState(recipe.protein_g);
  const [carbs, setCarbs] = useState(recipe.carbs_g);
  const [fat, setFat] = useState(recipe.fat_g);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasData = kcal !== null && protein !== null && carbs !== null && fat !== null;

  async function recalculate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/nutrition`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || body.error) {
        setError(body.error ?? "Berechnung fehlgeschlagen");
        return;
      }
      setKcal(body.data.kcal_per_serving);
      setProtein(body.data.protein_g);
      setCarbs(body.data.carbs_g);
      setFat(body.data.fat_g);
    } catch {
      setError("Berechnung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8 pt-8 border-t border-stone">
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="label-overline">Nährwerte</p>
        <button
          type="button"
          onClick={recalculate}
          disabled={loading}
          className="text-xs text-ink-tertiary hover:text-ink-primary transition-colors disabled:opacity-50"
        >
          {loading ? "Wird berechnet…" : "Neu berechnen"}
        </button>
      </div>

      {hasData ? (
        <div>
          <p className="text-sm text-ink-primary font-medium mb-1">
            ca. {kcal} kcal pro Portion
          </p>
          <p className="text-sm text-ink-secondary">
            Protein {protein} g &nbsp;·&nbsp; Kohlenhydrate {carbs} g &nbsp;·&nbsp; Fett {fat} g
          </p>
          <p className="text-xs text-ink-tertiary mt-1.5">
            Schätzwerte, können abweichen.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-tertiary">
          {loading ? "Nährwerte werden berechnet…" : "Nährwerte nicht verfügbar"}
          {!loading && (
            <button
              type="button"
              onClick={recalculate}
              className="ml-2 underline hover:text-ink-secondary transition-colors"
            >
              Berechnen
            </button>
          )}
        </p>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
