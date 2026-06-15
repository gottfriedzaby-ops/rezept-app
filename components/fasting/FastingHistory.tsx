"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useToast } from "@/contexts/ToastContext";
import { formatDuration } from "@/lib/fasting";
import type { FastingSession } from "@/types/fasting";

interface FastingHistoryProps {
  sessions: FastingSession[];
}

export default function FastingHistory({ sessions }: FastingHistoryProps) {
  const t = useTranslations("Fasting");
  const format = useFormatter();
  const router = useRouter();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/nutrition/fasting/${id}`, { method: "DELETE" });
      if (!res.ok) {
        showToast(t("errorGeneric"));
        return;
      }
      router.refresh();
    } catch {
      showToast(t("errorGeneric"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-serif text-xl font-medium text-ink-primary mb-4">{t("history")}</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-ink-tertiary">{t("historyEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => {
            const achievedSeconds = s.ended_at
              ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
              : 0;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded border border-stone bg-surface-card px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-primary">
                    {format.dateTime(new Date(s.started_at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs text-ink-tertiary tabular-nums">
                    {t("achieved")}: {formatDuration(achievedSeconds)} · {t("target")}: {s.target_hours} {t("hoursShort")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  disabled={busyId === s.id}
                  aria-label={t("removeEntry")}
                  className="w-6 h-6 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-secondary transition-colors shrink-0 text-sm leading-none disabled:opacity-40"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
