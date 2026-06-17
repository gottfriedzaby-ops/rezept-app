"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { addDays } from "@/lib/meal-plan";
import { useToast } from "@/contexts/ToastContext";
import CalorieRing from "@/components/nutrition/CalorieRing";
import MacroBars from "@/components/nutrition/MacroBars";
import FoodLogSection from "@/components/nutrition/FoodLogSection";
import AddFoodDialog from "@/components/nutrition/AddFoodDialog";
import NutritionGoalForm from "@/components/nutrition/NutritionGoalForm";
import NutritionInsights from "@/components/nutrition/NutritionInsights";
import {
  LOG_MEAL_SLOTS,
  type FoodLogEntry,
  type LogMealSlot,
  type NutritionProfile,
  type NutritionRecipeItem,
} from "@/types/nutrition";

interface NutritionDashboardProps {
  date: string;
  todayIso: string;
  profile: NutritionProfile | null;
  entries: FoodLogEntry[];
  recipes: NutritionRecipeItem[];
}

/** Noon UTC keeps Intl date formatting on the right calendar day in any timezone. */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export default function NutritionDashboard({
  date,
  todayIso,
  profile,
  entries,
  recipes,
}: NutritionDashboardProps) {
  const t = useTranslations("Nutrition");
  const format = useFormatter();
  const router = useRouter();
  const { showToast } = useToast();

  const [addSlot, setAddSlot] = useState<LogMealSlot | null>(null);
  const [editingGoals, setEditingGoals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"diary" | "insights">("diary");

  // ── Onboarding: no profile yet ────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-lg border border-stone bg-surface-card p-6">
          <h2 className="font-serif text-2xl font-medium text-ink-primary mb-1">
            {t("onboarding.title")}
          </h2>
          <p className="text-sm text-ink-secondary mb-6">{t("onboarding.intro")}</p>
          <NutritionGoalForm profile={null} />
        </div>
      </div>
    );
  }

  // ── Totals ──────────────────────────────────────────────────────────────
  const totals = entries.reduce(
    (acc, e) => {
      acc.kcal += e.kcal_per_serving * e.servings;
      acc.protein_g += e.protein_g * e.servings;
      acc.carbs_g += e.carbs_g * e.servings;
      acc.fat_g += e.fat_g * e.servings;
      return acc;
    },
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const target =
    profile.target_kcal != null
      ? {
          kcal: profile.target_kcal,
          protein_g: profile.target_protein_g ?? 0,
          carbs_g: profile.target_carbs_g ?? 0,
          fat_g: profile.target_fat_g ?? 0,
        }
      : null;

  const entriesBySlot = new Map<LogMealSlot, FoodLogEntry[]>();
  for (const slot of LOG_MEAL_SLOTS) entriesBySlot.set(slot, []);
  for (const entry of entries) {
    entriesBySlot.get(entry.meal_slot)?.push(entry);
  }

  const isToday = date === todayIso;
  const dateLabel = format.dateTime(isoToDate(date), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function handleChangeServings(entry: FoodLogEntry, delta: number) {
    if (busy) return;
    const next = Math.min(100, Math.max(1, entry.servings + delta));
    if (next === entry.servings) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/nutrition/log/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: next }),
      });
      if (!res.ok) {
        showToast(t("errorGeneric"));
        return;
      }
      router.refresh();
    } catch {
      showToast(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(entry: FoodLogEntry) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/nutrition/log/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast(t("errorGeneric"));
        return;
      }
      router.refresh();
    } catch {
      showToast(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* View toggle: diary vs insights dashboard */}
      <div className="flex gap-2 mb-8" role="group" aria-label={t("title")}>
        <button
          type="button"
          onClick={() => setView("diary")}
          aria-pressed={view === "diary"}
          className={`text-sm px-4 py-2 rounded border transition-colors ${
            view === "diary"
              ? "border-forest bg-forest-soft text-forest-deep font-medium"
              : "border-stone text-ink-secondary hover:bg-surface-hover"
          }`}
        >
          {t("tabs.diary")}
        </button>
        <button
          type="button"
          onClick={() => setView("insights")}
          aria-pressed={view === "insights"}
          className={`text-sm px-4 py-2 rounded border transition-colors ${
            view === "insights"
              ? "border-forest bg-forest-soft text-forest-deep font-medium"
              : "border-stone text-ink-secondary hover:bg-surface-hover"
          }`}
        >
          {t("tabs.insights")}
        </button>
      </div>

      {view === "insights" ? (
        <NutritionInsights onBackToDiary={() => setView("diary")} />
      ) : (
        <>
      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-8">
        <Link
          href={`/nutrition?date=${addDays(date, -1)}`}
          aria-label={t("prevDay")}
          className="w-9 h-9 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
        >
          ←
        </Link>
        <span className="text-sm font-medium text-ink-primary min-w-[12rem] text-center">
          {isToday ? t("today") : dateLabel}
        </span>
        <Link
          href={`/nutrition?date=${addDays(date, 1)}`}
          aria-label={t("nextDay")}
          className="w-9 h-9 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
        >
          →
        </Link>
        {!isToday && (
          <Link
            href="/nutrition"
            className="text-sm px-3 py-1.5 rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
          >
            {t("today")}
          </Link>
        )}
      </div>

      {/* Summary: ring + macros */}
      <div className="rounded-lg border border-stone bg-surface-card p-6 mb-8 flex flex-col sm:flex-row items-center gap-8">
        <CalorieRing
          consumed={totals.kcal}
          target={target?.kcal ?? null}
          remainingLabel={totals.kcal > (target?.kcal ?? Infinity) ? t("over") : t("remaining")}
          consumedLabel={t("units.kcal")}
        />
        <div className="flex-1 w-full">
          <MacroBars
            consumed={totals}
            target={target}
            labels={{ protein: t("goals.protein"), carbs: t("goals.carbs"), fat: t("goals.fat") }}
            unit={t("units.gram")}
          />
          <button
            type="button"
            onClick={() => setEditingGoals(true)}
            className="mt-4 text-sm text-ink-tertiary hover:text-forest transition-colors"
          >
            {t("goals.edit")}
          </button>
        </div>
      </div>

      {/* Meal sections */}
      <div className="space-y-4">
        {LOG_MEAL_SLOTS.map((slot) => (
          <FoodLogSection
            key={slot}
            slot={slot}
            entries={entriesBySlot.get(slot) ?? []}
            busy={busy}
            onAdd={setAddSlot}
            onDelete={handleDelete}
            onChangeServings={handleChangeServings}
          />
        ))}
      </div>

      <p className="text-xs text-ink-tertiary mt-6">{t("disclaimer")}</p>
        </>
      )}

      {addSlot && (
        <AddFoodDialog
          slot={addSlot}
          date={date}
          recipes={recipes}
          onClose={() => setAddSlot(null)}
          onAdded={() => setAddSlot(null)}
        />
      )}

      {editingGoals && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setEditingGoals(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-goals-title"
            className="relative bg-surface-card rounded-lg shadow-lg border border-stone p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
          >
            <h2 id="edit-goals-title" className="font-serif text-xl font-medium text-ink-primary mb-5">
              {t("goals.edit")}
            </h2>
            <NutritionGoalForm
              profile={profile}
              onSaved={() => setEditingGoals(false)}
              onCancel={() => setEditingGoals(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
