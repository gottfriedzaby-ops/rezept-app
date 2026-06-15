"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Release } from "@/lib/changelog";

interface WhatsNewDialogProps {
  open: boolean;
  releases: Release[];
  onClose: () => void;
}

export default function WhatsNewDialog({ open, releases, onClose }: WhatsNewDialogProps) {
  const t = useTranslations("WhatsNew");
  const locale = useLocale();
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    dismissRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || releases.length === 0) return null;

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-lg border border-stone bg-surface-card shadow-lg mx-4 motion-safe:animate-[shopping-pop_0.28s_ease-out]">
        <div className="p-6 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest mb-1">
            {t("eyebrow")}
          </p>
          <h2
            id="whats-new-title"
            className="font-serif text-xl font-medium text-ink-primary"
          >
            {t("title")}
          </h2>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6">
          {releases.map((release) => {
            const rawItems = t.raw(`releases.${release.messageKey}.items`);
            const items = Array.isArray(rawItems) ? (rawItems as string[]) : [];
            return (
              <section key={release.version}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-medium text-ink-primary">
                    {t(`releases.${release.messageKey}.title`)}
                  </h3>
                  <span className="shrink-0 text-xs text-ink-tertiary">
                    {t("versionShort", { version: release.version })} ·{" "}
                    {dateFormatter.format(new Date(release.date))}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {items.map((item, index) => (
                    <li
                      key={`${release.version}-${index}`}
                      className="flex gap-2 text-sm text-ink-secondary"
                    >
                      <span className="mt-0.5 shrink-0 text-forest" aria-hidden="true">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="p-6 pt-4">
          <button
            ref={dismissRef}
            type="button"
            onClick={onClose}
            className="btn-primary w-full"
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
