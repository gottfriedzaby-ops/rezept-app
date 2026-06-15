"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/contexts/ToastContext";
import {
  ACTIVITY_MULTIPLIERS,
  computeTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/lib/nutrition-goals";
import type { NutritionProfile } from "@/types/nutrition";

interface NutritionGoalFormProps {
  profile: NutritionProfile | null;
  /** Called after a successful save (e.g. to close an editing panel). */
  onSaved?: () => void;
  onCancel?: () => void;
}

const SEXES: Sex[] = ["male", "female", "diverse"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];
const ACTIVITY_LEVELS = Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[];

export default function NutritionGoalForm({ profile, onSaved, onCancel }: NutritionGoalFormProps) {
  const t = useTranslations("Nutrition");
  const router = useRouter();
  const { showToast } = useToast();

  const [sex, setSex] = useState<Sex>(profile?.sex ?? "female");
  const [birthDate, setBirthDate] = useState(profile?.birth_date ?? "");
  const [heightCm, setHeightCm] = useState(profile?.height_cm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(profile?.weight_kg?.toString() ?? "");
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity_level ?? "moderate");
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? "maintain");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const height = Number(heightCm);
  const weight = Number(weightKg);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(birthDate) &&
    Number.isFinite(height) &&
    height >= 50 &&
    height <= 280 &&
    Number.isFinite(weight) &&
    weight >= 20 &&
    weight <= 500;

  const preview = useMemo(() => {
    if (!valid) return null;
    return computeTargets({
      sex,
      birth_date: birthDate,
      height_cm: height,
      weight_kg: weight,
      activity_level: activity,
      goal,
    });
  }, [valid, sex, birthDate, height, weight, activity, goal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/nutrition/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sex,
          birth_date: birthDate,
          height_cm: height,
          weight_kg: weight,
          activity_level: activity,
          goal,
        }),
      });
      const json = await res.json().catch(() => ({ error: null }));
      if (!res.ok) {
        setError(json.error ?? t("errorGeneric"));
        return;
      }
      showToast(t("goals.savedToast"));
      router.refresh();
      onSaved?.();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="label-overline block mb-2">{t("goals.sex")}</label>
        <div className="flex gap-2">
          {SEXES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className={`flex-1 text-sm px-3 py-2 rounded border transition-colors ${
                sex === s
                  ? "border-forest bg-forest-soft text-forest-deep font-medium"
                  : "border-stone text-ink-secondary hover:bg-surface-hover"
              }`}
            >
              {t(`goals.sexOptions.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="ng-birth" className="label-overline block mb-2">
            {t("goals.birthDate")}
          </label>
          <input
            id="ng-birth"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="ng-height" className="label-overline block mb-2">
            {t("goals.height")}
          </label>
          <input
            id="ng-height"
            type="number"
            inputMode="numeric"
            min={50}
            max={280}
            value={heightCm}
            onChange={(e) => setHeightCm(e.target.value)}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="ng-weight" className="label-overline block mb-2">
            {t("goals.weight")}
          </label>
          <input
            id="ng-weight"
            type="number"
            inputMode="decimal"
            min={20}
            max={500}
            step="0.1"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            className="input-field"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ng-activity" className="label-overline block mb-2">
            {t("goals.activity")}
          </label>
          <select
            id="ng-activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value as ActivityLevel)}
            className="input-field"
          >
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a} value={a}>
                {t(`goals.activityOptions.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ng-goal" className="label-overline block mb-2">
            {t("goals.goal")}
          </label>
          <select
            id="ng-goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value as Goal)}
            className="input-field"
          >
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {t(`goals.goalOptions.${g}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border border-stone bg-surface-secondary p-4">
          <p className="label-overline mb-1">{t("goals.computedBudget")}</p>
          <p className="font-serif text-2xl font-medium text-ink-primary">
            {preview.target_kcal} {t("units.kcal")}
          </p>
          <p className="text-sm text-ink-secondary mt-1">
            {t("goals.protein")} {preview.target_protein_g} {t("units.gram")} ·{" "}
            {t("goals.carbs")} {preview.target_carbs_g} {t("units.gram")} ·{" "}
            {t("goals.fat")} {preview.target_fat_g} {t("units.gram")}
          </p>
        </div>
      )}

      <p className="text-xs text-ink-tertiary">{t("disclaimer")}</p>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={!valid || saving} className="btn-primary">
          {saving ? t("goals.saving") : t("goals.save")}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            {t("cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
