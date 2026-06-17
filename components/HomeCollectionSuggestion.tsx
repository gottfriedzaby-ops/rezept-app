"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CollectionIcon } from "@/lib/collection-icons";
import type { CollectionSuggestion } from "@/lib/collection-suggestions";

interface HomeCollectionSuggestionProps {
  suggestion: CollectionSuggestion;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Schlanke Karte mit dem Top-Vorschlag auf der Startseite — ein Tippen legt die
 * Sammlung an (die vollständige Liste lebt unter /collections).
 */
export default function HomeCollectionSuggestion({ suggestion }: HomeCollectionSuggestionProps) {
  const t = useTranslations("CollectionSuggestions");
  const locale = useLocale();
  const router = useRouter();

  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collections/suggestions/apply", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ key: suggestion.key, locale }),
      });
      if (!res.ok) {
        setError(t("applyError"));
        return;
      }
      setHidden(true);
      router.refresh();
    } catch {
      setError(t("applyError"));
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    setHidden(true);
    try {
      await fetch("/api/collections/suggestions/dismiss", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ key: suggestion.key }),
      });
    } catch {
      // Best effort.
    }
  }

  if (hidden) return null;

  return (
    <div>
      <p className="label-overline mb-4">{t("sectionTitle")}</p>
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-stone bg-surface-card p-5">
        <div className="flex items-center justify-center w-11 h-11 rounded-full bg-forest-soft shrink-0">
          <CollectionIcon smartKey={suggestion.key} className="w-6 h-6 text-forest" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-primary text-sm leading-snug break-words">
            {t(`categories.${suggestion.key}.name`)}
          </p>
          <p className="text-xs text-ink-tertiary mt-0.5">
            {t("matchCount", { count: suggestion.matchCount })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? t("applying") : t("apply")}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("dismissAriaLabel")}
            className="w-9 h-9 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-hover transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-4 h-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
