"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAnalytics } from "@/contexts/AnalyticsContext";

interface CookAssistantProps {
  recipeId: string;
  stepIndex: number;
  servings: number;
}

type Phase = "idle" | "loading" | "done" | "error";

// Inline Q&A while cooking — sends the question with the current step as
// context to /api/assistant/cooking-question (Haiku, short German answers).
export default function CookAssistant({ recipeId, stepIndex, servings }: CookAssistantProps) {
  const t = useTranslations("CookMode");
  const { track } = useAnalytics();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  async function ask() {
    const text = question.trim();
    if (text.length < 3 || phase === "loading") return;
    setPhase("loading");
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/assistant/cooking-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: recipeId,
          question: text,
          step_index: stepIndex,
          servings,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.answer) {
        setError(json?.error ?? t("assistantError"));
        setPhase("error");
        return;
      }
      setAnswer(json.data.answer as string);
      setPhase("done");
      track("assistant_query", { kind: "cooking_question" });
    } catch {
      setError(t("assistantError"));
      setPhase("error");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-sm text-ink-tertiary hover:text-ink-primary border border-dashed border-stone hover:border-ink-secondary rounded px-3 py-1.5 transition-colors"
      >
        💬 {t("assistantTitle")}
      </button>
    );
  }

  return (
    <div className="border border-stone rounded-lg bg-surface-secondary p-4">
      <p className="label-overline mb-3">{t("assistantTitle")}</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          maxLength={500}
          placeholder={t("assistantPlaceholder")}
          className="input-field flex-1"
          aria-label={t("assistantTitle")}
        />
        <button
          type="button"
          onClick={ask}
          disabled={question.trim().length < 3 || phase === "loading"}
          className="btn-primary shrink-0"
        >
          {phase === "loading" ? t("assistantLoading") : t("assistantAsk")}
        </button>
      </div>

      {phase === "error" && error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {phase === "done" && answer && (
        <p className="mt-3 text-sm text-ink-primary leading-relaxed">{answer}</p>
      )}
    </div>
  );
}
