"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/contexts/ToastContext";
import { recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";
import type { LogMealSlot, NutritionRecipeItem } from "@/types/nutrition";

const MAX_RESULTS = 50;

interface AddFoodDialogProps {
  slot: LogMealSlot;
  date: string;
  recipes: NutritionRecipeItem[];
  onClose: () => void;
  onAdded: () => void;
}

type Tab = "recipe" | "manual" | "photo";

export default function AddFoodDialog({ slot, date, recipes, onClose, onAdded }: AddFoodDialogProps) {
  const t = useTranslations("Nutrition");
  const router = useRouter();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>("recipe");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Manual entry form
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  // True once the manual form was prefilled from a photo estimate — the entry
  // is then logged with source "photo" rather than "manual".
  const [photoEstimate, setPhotoEstimate] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
    return matches.slice(0, MAX_RESULTS);
  }, [recipes, query]);

  async function logEntry(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/nutrition/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, meal_slot: slot, ...payload }),
      });
      const json = await res.json().catch(() => ({ error: null }));
      if (!res.ok) {
        showToast(json.error ?? t("errorGeneric"));
        return false;
      }
      return true;
    } catch {
      showToast(t("errorGeneric"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handlePickRecipe(recipe: NutritionRecipeItem) {
    if (busy) return;
    const ok = await logEntry({ source: "recipe", recipe_id: recipe.id, servings: 1 });
    if (ok) {
      router.refresh();
      onAdded();
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const kcalNum = Number(kcal);
    if (label.trim().length === 0) {
      showToast(t("addFood.nameRequired"));
      return;
    }
    if (!Number.isFinite(kcalNum) || kcalNum < 0) {
      showToast(t("addFood.kcalRequired"));
      return;
    }
    const ok = await logEntry({
      source: photoEstimate ? "photo" : "manual",
      label: label.trim(),
      servings: 1,
      kcal_per_serving: kcalNum,
      protein_g: Number(protein) || 0,
      carbs_g: Number(carbs) || 0,
      fat_g: Number(fat) || 0,
    });
    if (ok) {
      router.refresh();
      onAdded();
    }
  }

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || analyzing) return;
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/nutrition/estimate-photo", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ data: null, error: null }));
      if (!res.ok || !json.data) {
        showToast(json.error ?? t("addFood.photoFailed"));
        return;
      }
      const est = json.data as {
        label: string | null;
        kcal_per_serving: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
      };
      setLabel(est.label ?? "");
      setKcal(est.kcal_per_serving != null ? String(est.kcal_per_serving) : "");
      setProtein(est.protein_g != null ? String(est.protein_g) : "");
      setCarbs(est.carbs_g != null ? String(est.carbs_g) : "");
      setFat(est.fat_g != null ? String(est.fat_g) : "");
      setPhotoEstimate(true);
      setTab("manual");
    } catch {
      showToast(t("addFood.photoFailed"));
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-food-title"
        className="relative bg-surface-card rounded-lg shadow-lg border border-stone p-6 max-w-md w-full mx-4 max-h-[85vh] flex flex-col"
      >
        <h2 id="add-food-title" className="font-serif text-lg font-medium text-ink-primary mb-1">
          {t("addFood.title")}
        </h2>
        <p className="text-sm text-ink-tertiary mb-4">{t(`slots.${slot}`)}</p>

        <div className="flex gap-1 mb-4 rounded-lg bg-surface-secondary p-1">
          <button
            type="button"
            onClick={() => setTab("recipe")}
            className={`flex-1 text-sm px-3 py-1.5 rounded transition-colors ${
              tab === "recipe" ? "bg-surface-card text-ink-primary font-medium shadow-sm" : "text-ink-secondary"
            }`}
          >
            {t("addFood.tabRecipe")}
          </button>
          <button
            type="button"
            onClick={() => setTab("photo")}
            className={`flex-1 text-sm px-3 py-1.5 rounded transition-colors ${
              tab === "photo" ? "bg-surface-card text-ink-primary font-medium shadow-sm" : "text-ink-secondary"
            }`}
          >
            {t("addFood.tabPhoto")}
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`flex-1 text-sm px-3 py-1.5 rounded transition-colors ${
              tab === "manual" ? "bg-surface-card text-ink-primary font-medium shadow-sm" : "text-ink-secondary"
            }`}
          >
            {t("addFood.tabManual")}
          </button>
        </div>

        {tab === "recipe" ? (
          recipes.length === 0 ? (
            <p className="text-sm text-ink-secondary">{t("addFood.noRecipesYet")}</p>
          ) : (
            <>
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && onClose()}
                placeholder={t("addFood.searchPlaceholder")}
                className="input-field mb-4"
              />
              {filtered.length === 0 ? (
                <p className="text-sm text-ink-tertiary">{t("addFood.noRecipesFound")}</p>
              ) : (
                <ul className="overflow-y-auto -mx-2 px-2 space-y-1">
                  {filtered.map((recipe) => {
                    const badge = recipeTypeBadgeFor(recipe.recipe_type ?? "kochen");
                    const hasNutrition = recipe.kcal_per_serving != null;
                    return (
                      <li key={recipe.id}>
                        <button
                          type="button"
                          onClick={() => handlePickRecipe(recipe)}
                          disabled={busy}
                          className="w-full flex items-center gap-3 text-left px-3 py-2 rounded hover:bg-surface-hover transition-colors disabled:opacity-50"
                        >
                          <span aria-hidden="true" className="shrink-0">
                            {badge.emoji}
                          </span>
                          <span className="flex-1 text-sm text-ink-primary leading-snug line-clamp-2">
                            {recipe.title}
                          </span>
                          {hasNutrition ? (
                            <span className="text-xs text-ink-tertiary tabular-nums shrink-0">
                              {Math.round(recipe.kcal_per_serving as number)} {t("units.kcal")}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-tertiary shrink-0">
                              {t("addFood.noNutrition")}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )
        ) : tab === "photo" ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">{t("addFood.photoHint")}</p>
            <label className="btn-primary w-full inline-flex items-center justify-center cursor-pointer">
              {analyzing ? t("addFood.analyzing") : t("addFood.analyzePhoto")}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={analyzing}
                onChange={handlePhotoSelect}
                className="sr-only"
              />
            </label>
            <p className="text-xs text-ink-tertiary">{t("disclaimer")}</p>
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            {photoEstimate && (
              <p className="text-xs text-forest-deep bg-forest-soft rounded px-3 py-2">
                {t("addFood.photoEstimateNote")}
              </p>
            )}
            <input
              type="text"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("addFood.namePlaceholder")}
              maxLength={200}
              className="input-field"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label-overline block mb-1">{t("addFood.kcal")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={kcal}
                  onChange={(e) => setKcal(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="label-overline block mb-1">{t("goals.protein")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="label-overline block mb-1">{t("goals.carbs")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="label-overline block mb-1">{t("goals.fat")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="input-field"
                />
              </label>
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? t("addFood.adding") : t("addFood.add")}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-ink-tertiary hover:text-ink-primary transition-colors self-center"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
