"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/contexts/ToastContext";
import { FASTING_PRESETS, type FastingPresetId } from "@/lib/fasting";
import FastingTimer from "@/components/fasting/FastingTimer";
import FastingHistory from "@/components/fasting/FastingHistory";
import type { FastingSession } from "@/types/fasting";

interface FastingDashboardProps {
  active: FastingSession | null;
  history: FastingSession[];
  initialNow: number;
}

export default function FastingDashboard({ active, history, initialNow }: FastingDashboardProps) {
  const t = useTranslations("Fasting");
  const router = useRouter();
  const { showToast } = useToast();

  const [preset, setPreset] = useState<FastingPresetId>("16:8");
  const [customHours, setCustomHours] = useState("14");
  const [busy, setBusy] = useState(false);

  async function handleStart() {
    if (busy) return;
    const targetHours = preset === "custom" ? Number(customHours) : FASTING_PRESETS.find((p) => p.id === preset)?.hours;
    if (!targetHours || !Number.isFinite(targetHours) || targetHours < 1 || targetHours > 48) {
      showToast(t("errorGeneric"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/nutrition/fasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset, target_hours: targetHours }),
      });
      const json = await res.json().catch(() => ({ error: null }));
      if (!res.ok) {
        showToast(json.error ?? t("errorGeneric"));
        return;
      }
      router.refresh();
    } catch {
      showToast(t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!active || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/nutrition/fasting/${active.id}`, { method: "PATCH" });
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
      <div className="rounded-lg border border-stone bg-surface-card p-6 sm:p-8 flex flex-col items-center">
        {active ? (
          <>
            <FastingTimer session={active} initialNow={initialNow} />
            <button type="button" onClick={handleStop} disabled={busy} className="btn-ghost mt-6">
              {busy ? t("stopping") : t("stopFast")}
            </button>
          </>
        ) : (
          <div className="w-full max-w-sm">
            <p className="label-overline mb-3 text-center">{t("chooseProgram")}</p>
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {FASTING_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPreset(p.id)}
                  className={`text-sm px-4 py-2 rounded border transition-colors ${
                    preset === p.id
                      ? "border-forest bg-forest-soft text-forest-deep font-medium"
                      : "border-stone text-ink-secondary hover:bg-surface-hover"
                  }`}
                >
                  {t(`presets.${p.id}`)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={`text-sm px-4 py-2 rounded border transition-colors ${
                  preset === "custom"
                    ? "border-forest bg-forest-soft text-forest-deep font-medium"
                    : "border-stone text-ink-secondary hover:bg-surface-hover"
                }`}
              >
                {t("custom")}
              </button>
            </div>

            {preset === "custom" && (
              <label className="block mb-4">
                <span className="label-overline block mb-1">{t("customHours")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={48}
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  className="input-field"
                />
              </label>
            )}

            <button type="button" onClick={handleStart} disabled={busy} className="btn-primary w-full">
              {busy ? t("starting") : t("startFast")}
            </button>
          </div>
        )}
      </div>

      <FastingHistory sessions={history} />
    </div>
  );
}
