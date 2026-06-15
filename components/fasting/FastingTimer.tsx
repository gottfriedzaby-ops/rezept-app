"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { computeFastingProgress, formatClock, formatDuration } from "@/lib/fasting";
import type { FastingSession } from "@/types/fasting";

const SIZE = 208;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface FastingTimerProps {
  session: FastingSession;
  /** Server-render timestamp, reused for the first client paint to avoid a hydration mismatch. */
  initialNow: number;
}

export default function FastingTimer({ session, initialNow }: FastingTimerProps) {
  const t = useTranslations("Fasting");
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const progress = computeFastingProgress(session.started_at, session.target_hours, new Date(now));
  const dashOffset = CIRCUMFERENCE * (1 - progress.percent);

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-surface-secondary" />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={progress.isComplete ? "stroke-forest-deep" : "stroke-forest"}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="label-overline mb-1">{t("elapsed")}</span>
          <span className="font-serif text-3xl font-medium tabular-nums text-ink-primary">
            {formatClock(progress.elapsedSeconds)}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-secondary">
        {t("target")}: {session.target_hours} {t("hoursShort")} (
        {session.preset === "custom" ? t("custom") : t(`presets.${session.preset}`)})
      </p>
      {progress.isComplete ? (
        <p className="mt-1 text-sm font-medium text-forest-deep">
          {t("goalReached")}
          {progress.remainingSeconds < 0 && ` · ${formatDuration(-progress.remainingSeconds)} ${t("overtimeLabel")}`}
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-tertiary">
          {t("remaining")}: {formatDuration(progress.remainingSeconds)}
        </p>
      )}
    </div>
  );
}
