"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

type ImportType = "url" | "youtube" | "photo" | "instagram" | "pdf";

// ms after mount to advance to stage 1, 2, 3, 4
const STAGE_DELAYS = [1000, 4000, 8000, 20000];
const OVERDUE_DELAY = 35000;

interface Props {
  importType: ImportType;
}

export default function ImportProgress({ importType }: Props) {
  const t = useTranslations("Import");
  const [activeStage, setActiveStage] = useState(0);
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    STAGE_DELAYS.forEach((delay, idx) => {
      timers.push(setTimeout(() => setActiveStage(idx + 1), delay));
    });
    timers.push(setTimeout(() => setOverdue(true), OVERDUE_DELAY));

    return () => timers.forEach(clearTimeout);
  }, []);

  const firstStageKeys: Record<ImportType, string> = {
    url: t("progressUrl"),
    youtube: t("progressYoutube"),
    photo: t("progressPhoto"),
    instagram: t("progressInstagram"),
    pdf: t("progressPdf"),
  };

  const stages = [
    firstStageKeys[importType],
    t("progressExtract"),
    t("progressStructure"),
    t("progressQuality"),
    t("progressAlmost"),
  ];

  return (
    <div className="flex flex-col gap-3 py-2">
      {stages.map((label, idx) => {
        const done = idx < activeStage;
        const active = idx === activeStage;

        return (
          <div
            key={idx}
            className={`flex items-center gap-3 transition-opacity duration-500 ${
              idx > activeStage ? "opacity-30" : "opacity-100"
            }`}
          >
            <div className="w-4 h-4 shrink-0 flex items-center justify-center">
              {done ? (
                <svg className="w-4 h-4 text-forest" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8l3.5 3.5L13 5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span
                  className={`block w-2 h-2 rounded-full ${
                    active ? "bg-forest animate-pulse" : "bg-stone"
                  }`}
                />
              )}
            </div>
            <span
              className={`text-sm transition-colors duration-300 ${
                done ? "text-ink-tertiary" : active ? "text-ink-primary font-medium" : "text-ink-tertiary"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}

      {overdue && (
        <p className="text-xs text-ink-tertiary mt-1 animate-pulse pl-7">
          {t("progressOverdue")}
        </p>
      )}
    </div>
  );
}
