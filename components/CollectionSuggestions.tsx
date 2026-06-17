"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CollectionIcon } from "@/lib/collection-icons";
import type { CollectionSuggestion, SmartCollectionKey } from "@/lib/collection-suggestions";

interface CollectionSuggestionsProps {
  suggestions: CollectionSuggestion[];
}

interface AiSuggestion {
  name: string;
  recipeIds: string[];
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function CollectionSuggestions({ suggestions }: CollectionSuggestionsProps) {
  const t = useTranslations("CollectionSuggestions");
  const locale = useLocale();
  const router = useRouter();

  const [items, setItems] = useState<CollectionSuggestion[]>(suggestions);
  const [busyKey, setBusyKey] = useState<SmartCollectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<AiSuggestion[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBusyName, setAiBusyName] = useState<string | null>(null);

  async function applyCanonical(key: SmartCollectionKey) {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await fetch("/api/collections/suggestions/apply", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ key, locale }),
      });
      if (!res.ok) {
        setError(t("applyError"));
        return;
      }
      setItems((prev) => prev.filter((s) => s.key !== key));
      router.refresh();
    } catch {
      setError(t("applyError"));
    } finally {
      setBusyKey(null);
    }
  }

  async function dismiss(key: SmartCollectionKey) {
    setItems((prev) => prev.filter((s) => s.key !== key));
    try {
      await fetch("/api/collections/suggestions/dismiss", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ key }),
      });
    } catch {
      // Best effort — verworfener Vorschlag erscheint sonst beim nächsten Laden erneut.
    }
  }

  async function loadAi() {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/collections/suggestions/ai", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setAiError(body.error || t("aiError"));
        setAiItems([]);
        return;
      }
      setAiItems((body.data?.suggestions as AiSuggestion[]) ?? []);
    } catch {
      setAiError(t("aiError"));
      setAiItems([]);
    } finally {
      setAiLoading(false);
    }
  }

  async function applyAi(suggestion: AiSuggestion) {
    if (aiBusyName) return;
    setAiBusyName(suggestion.name);
    setAiError(null);
    try {
      const res = await fetch("/api/collections/suggestions/apply", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: suggestion.name, recipe_ids: suggestion.recipeIds }),
      });
      if (!res.ok) {
        setAiError(t("applyError"));
        return;
      }
      setAiItems((prev) => (prev ?? []).filter((s) => s.name !== suggestion.name));
      router.refresh();
    } catch {
      setAiError(t("applyError"));
    } finally {
      setAiBusyName(null);
    }
  }

  return (
    <section className="mb-12">
      <div className="mb-1">
        <p className="label-overline">{t("sectionTitle")}</p>
      </div>
      <p className="text-sm text-ink-secondary mb-6">{t("sectionSubtitle")}</p>

      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((suggestion) => (
            <div
              key={suggestion.key}
              className="relative rounded-xl border border-stone bg-surface-card p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-forest-soft shrink-0">
                  <CollectionIcon smartKey={suggestion.key} className="w-5 h-5 text-forest" />
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(suggestion.key)}
                  aria-label={t("dismissAriaLabel")}
                  className="w-8 h-8 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-hover transition-colors"
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
              <p className="font-medium text-ink-primary text-sm leading-snug break-words">
                {t(`categories.${suggestion.key}.name`)}
              </p>
              <p className="text-xs text-ink-tertiary mt-1 mb-4">
                {t("matchCount", { count: suggestion.matchCount })}
              </p>
              <button
                type="button"
                onClick={() => applyCanonical(suggestion.key)}
                disabled={busyKey !== null}
                className="btn-primary mt-auto w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busyKey === suggestion.key ? t("applying") : t("apply")}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Hybrid: nutzerausgelöster KI-Pass für weitere Themen */}
      <div className="mt-6">
        {aiItems === null ? (
          <button
            type="button"
            onClick={loadAi}
            disabled={aiLoading}
            className="btn-ghost inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-4 h-4 text-forest"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 3l1.3 3.7L15 8l-3.7 1.3L10 13l-1.3-3.7L5 8l3.7-1.3L10 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 13l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6.6-1.9z" />
            </svg>
            {aiLoading ? t("aiLoading") : t("aiButton")}
          </button>
        ) : (
          <>
            <p className="label-overline mb-4">{t("aiTitle")}</p>
            {aiItems.length === 0 ? (
              <p className="text-sm text-ink-secondary">{t("aiEmpty")}</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiItems.map((suggestion) => (
                  <div
                    key={suggestion.name}
                    className="relative rounded-xl border border-stone bg-surface-card p-5 flex flex-col"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-forest-soft shrink-0">
                        <CollectionIcon className="w-5 h-5 text-forest" />
                      </div>
                      <span className="text-[0.65rem] uppercase tracking-widest font-medium text-forest bg-forest-soft rounded px-1.5 py-0.5">
                        {t("aiBadge")}
                      </span>
                    </div>
                    <p className="font-medium text-ink-primary text-sm leading-snug break-words">
                      {suggestion.name}
                    </p>
                    <p className="text-xs text-ink-tertiary mt-1 mb-4">
                      {t("matchCount", { count: suggestion.recipeIds.length })}
                    </p>
                    <button
                      type="button"
                      onClick={() => applyAi(suggestion)}
                      disabled={aiBusyName !== null}
                      className="btn-primary mt-auto w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {aiBusyName === suggestion.name ? t("applying") : t("apply")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {aiError && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {aiError}
          </p>
        )}
      </div>
    </section>
  );
}
