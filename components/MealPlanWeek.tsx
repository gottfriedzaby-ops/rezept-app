"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { addDays, getWeekDates, getWeekStart } from "@/lib/meal-plan";
import { addRecipeItems, notifyListChanged } from "@/lib/shopping-list";
import { useToast } from "@/contexts/ToastContext";
import MealPlanRecipePicker from "@/components/MealPlanRecipePicker";
import {
  MEAL_SLOTS,
  type MealPlanEntryWithRecipe,
  type MealPlanRecipe,
  type MealSlot,
} from "@/types/meal-plan";
import type { Ingredient } from "@/types/recipe";

interface MealPlanWeekProps {
  weekStart: string;
  entries: MealPlanEntryWithRecipe[];
  recipes: MealPlanRecipe[];
}

interface PickerTarget {
  date: string;
  slot: MealSlot;
}

/** Noon UTC keeps Intl date formatting on the right calendar day in any timezone. */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function flattenIngredients(recipe: MealPlanRecipe): Ingredient[] {
  return recipe.sections && recipe.sections.length > 0
    ? recipe.sections.flatMap((section) => section.ingredients)
    : recipe.ingredients;
}

export default function MealPlanWeek({ weekStart, entries, recipes }: MealPlanWeekProps) {
  const t = useTranslations("MealPlan");
  const tShopping = useTranslations("ShoppingList");
  const format = useFormatter();
  const router = useRouter();
  const { showToast } = useToast();

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [busy, setBusy] = useState(false);

  const weekDates = getWeekDates(weekStart);
  const todayIso = localTodayIso();
  const isCurrentWeek = weekStart === getWeekStart();

  const entriesBySlot = new Map<string, MealPlanEntryWithRecipe[]>();
  for (const entry of entries) {
    const key = `${entry.date}|${entry.meal_slot}`;
    const list = entriesBySlot.get(key) ?? [];
    list.push(entry);
    entriesBySlot.set(key, list);
  }

  const weekLabel = `${format.dateTime(isoToDate(weekStart), {
    day: "numeric",
    month: "short",
  })} – ${format.dateTime(isoToDate(addDays(weekStart, 6)), {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

  function effectiveServings(entry: MealPlanEntryWithRecipe): number {
    return entry.servings ?? entry.recipe.servings ?? 1;
  }

  async function handlePick(recipe: MealPlanRecipe) {
    if (!pickerTarget || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: pickerTarget.date,
          meal_slot: pickerTarget.slot,
          recipe_id: recipe.id,
        }),
      });
      const json = await res.json().catch(() => ({ error: null }));
      if (!res.ok) {
        showToast(json.error ?? t("errorGeneric"));
        return;
      }
      setPickerTarget(null);
      router.refresh();
    } catch {
      showToast(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeServings(entry: MealPlanEntryWithRecipe, delta: number) {
    if (busy) return;
    const next = Math.min(20, Math.max(1, effectiveServings(entry) + delta));
    if (next === effectiveServings(entry)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/meal-plan/${entry.id}`, {
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

  async function handleRemove(entry: MealPlanEntryWithRecipe) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/meal-plan/${entry.id}`, { method: "DELETE" });
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

  function handleAddWeekToShoppingList() {
    let total = 0;
    for (const entry of entries) {
      const ingredients = flattenIngredients(entry.recipe);
      if (ingredients.length === 0) continue;
      total += addRecipeItems(
        { id: entry.recipe.id, title: entry.recipe.title, servings: entry.recipe.servings },
        ingredients,
        effectiveServings(entry)
      );
    }
    if (total > 0) {
      notifyListChanged();
      showToast(tShopping("addedToast", { count: total }));
    }
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            href={`/meal-plan?week=${addDays(weekStart, -7)}`}
            aria-label={t("prevWeek")}
            className="w-9 h-9 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
          >
            ←
          </Link>
          <span className="text-sm font-medium text-ink-primary min-w-[12rem] text-center">
            {weekLabel}
          </span>
          <Link
            href={`/meal-plan?week=${addDays(weekStart, 7)}`}
            aria-label={t("nextWeek")}
            className="w-9 h-9 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
          >
            →
          </Link>
          {!isCurrentWeek && (
            <Link
              href="/meal-plan"
              className="text-sm px-3 py-1.5 rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
            >
              {t("currentWeek")}
            </Link>
          )}
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={handleAddWeekToShoppingList}
            className="btn-primary inline-flex items-center gap-2"
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
            {t("addWeekToShoppingList")}
          </button>
        )}
      </div>

      {entries.length === 0 && (
        <p className="text-sm text-ink-tertiary mb-6">{t("emptyWeek")}</p>
      )}

      {/* Week grid: stacked days on mobile, columns on wide screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {weekDates.map((date) => {
          const isToday = date === todayIso;
          return (
            <section
              key={date}
              className={`border rounded-lg p-3 bg-white ${
                isToday ? "border-forest" : "border-stone"
              }`}
            >
              <h2
                className={`text-sm font-medium mb-3 ${
                  isToday ? "text-forest" : "text-ink-primary"
                }`}
              >
                {format.dateTime(isoToDate(date), {
                  weekday: "short",
                  day: "numeric",
                  month: "numeric",
                })}
              </h2>

              <div className="space-y-3">
                {MEAL_SLOTS.map((slot) => {
                  const slotEntries = entriesBySlot.get(`${date}|${slot}`) ?? [];
                  return (
                    <div key={slot}>
                      <p className="label-overline mb-1.5">{t(slot)}</p>
                      <ul className="space-y-1.5">
                        {slotEntries.map((entry) => (
                          <li
                            key={entry.id}
                            className="group rounded border border-stone bg-surface-primary px-2.5 py-2"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <Link
                                href={`/${entry.recipe.id}`}
                                className="text-sm text-ink-primary leading-snug hover:text-forest transition-colors line-clamp-2"
                              >
                                {entry.recipe.title}
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleRemove(entry)}
                                disabled={busy}
                                aria-label={t("removeEntry")}
                                className="w-5 h-5 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-secondary transition-colors shrink-0 text-sm leading-none disabled:opacity-40"
                              >
                                ×
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <button
                                type="button"
                                onClick={() => handleChangeServings(entry, -1)}
                                disabled={busy || effectiveServings(entry) <= 1}
                                aria-label={t("decreaseServings")}
                                className="w-5 h-5 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors text-xs leading-none disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="text-xs text-ink-secondary tabular-nums">
                                {t("servingsShort", { count: effectiveServings(entry) })}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleChangeServings(entry, 1)}
                                disabled={busy || effectiveServings(entry) >= 20}
                                aria-label={t("increaseServings")}
                                className="w-5 h-5 flex items-center justify-center rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors text-xs leading-none disabled:opacity-40"
                              >
                                +
                              </button>
                            </div>
                          </li>
                        ))}
                        <li>
                          <button
                            type="button"
                            onClick={() => setPickerTarget({ date, slot })}
                            aria-label={`${t("addRecipe")} — ${t(slot)}`}
                            className="w-full text-left text-sm text-ink-tertiary hover:text-forest border border-dashed border-stone hover:border-forest rounded px-2.5 py-1.5 transition-colors"
                          >
                            +
                          </button>
                        </li>
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {pickerTarget && (
        <MealPlanRecipePicker
          recipes={recipes}
          onPick={handlePick}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
