"use client";

import { useTranslations } from "next-intl";
import type { FoodLogEntry, LogMealSlot } from "@/types/nutrition";

interface FoodLogSectionProps {
  slot: LogMealSlot;
  entries: FoodLogEntry[];
  busy: boolean;
  onAdd: (slot: LogMealSlot) => void;
  onDelete: (entry: FoodLogEntry) => void;
  onChangeServings: (entry: FoodLogEntry, delta: number) => void;
}

export default function FoodLogSection({
  slot,
  entries,
  busy,
  onAdd,
  onDelete,
  onChangeServings,
}: FoodLogSectionProps) {
  const t = useTranslations("Nutrition");
  const slotKcal = Math.round(
    entries.reduce((sum, e) => sum + e.kcal_per_serving * e.servings, 0)
  );

  return (
    <section className="rounded-lg border border-stone bg-surface-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-serif text-lg font-medium text-ink-primary">{t(`slots.${slot}`)}</h2>
        <span className="text-sm text-ink-tertiary tabular-nums">
          {slotKcal} {t("units.kcal")}
        </span>
      </div>

      <ul className="space-y-2">
        {entries.map((entry) => {
          const total = Math.round(entry.kcal_per_serving * entry.servings);
          return (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded border border-stone bg-surface-primary px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-primary leading-snug line-clamp-1">{entry.label}</p>
                <p className="text-xs text-ink-tertiary tabular-nums">
                  {total} {t("units.kcal")} · {t("goals.protein")} {Math.round(entry.protein_g * entry.servings)}
                  {t("units.gram")} · {t("goals.carbs")} {Math.round(entry.carbs_g * entry.servings)}
                  {t("units.gram")} · {t("goals.fat")} {Math.round(entry.fat_g * entry.servings)}
                  {t("units.gram")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeServings(entry, -1)}
                  disabled={busy || entry.servings <= 1}
                  aria-label={t("decreaseServings")}
                  className="w-6 h-6 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors text-sm leading-none disabled:opacity-40"
                >
                  −
                </button>
                <span className="text-xs text-ink-secondary tabular-nums w-6 text-center">
                  {entry.servings}
                </span>
                <button
                  type="button"
                  onClick={() => onChangeServings(entry, 1)}
                  disabled={busy || entry.servings >= 100}
                  aria-label={t("increaseServings")}
                  className="w-6 h-6 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors text-sm leading-none disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={() => onDelete(entry)}
                disabled={busy}
                aria-label={t("removeEntry")}
                className="w-6 h-6 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-secondary transition-colors shrink-0 text-sm leading-none disabled:opacity-40"
              >
                ×
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => onAdd(slot)}
            disabled={busy}
            className="w-full text-left text-sm text-ink-tertiary hover:text-forest border border-dashed border-stone hover:border-forest rounded px-3 py-2 transition-colors disabled:opacity-40"
          >
            + {t("addFood.add")}
          </button>
        </li>
      </ul>
    </section>
  );
}
