"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface RecipeRatingProps {
  recipeId: string;
  initialRating: number | null;
}

// Owner-only star rating (1–5). Clicking the current rating clears it.
export default function RecipeRating({ recipeId, initialRating }: RecipeRatingProps) {
  const t = useTranslations("RecipeDetail");
  const [rating, setRating] = useState<number | null>(initialRating);
  const [saving, setSaving] = useState(false);

  async function select(value: number) {
    if (saving) return;
    const next = value === rating ? null : value;
    const previous = rating;
    setRating(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) setRating(previous);
    } catch {
      setRating(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role="radiogroup"
      aria-label={t("ratingLabel")}
    >
      {[1, 2, 3, 4, 5].map((value) => {
        const filled = rating !== null && value <= rating;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={t("ratingStars", { count: value })}
            onClick={() => select(value)}
            disabled={saving}
            className="w-8 h-8 flex items-center justify-center rounded text-amber-400 hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <svg
              viewBox="0 0 16 16"
              fill={filled ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.2}
              className={`w-5 h-5 ${filled ? "" : "text-ink-tertiary"}`}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 2.5l1.545 3.13 3.455.5-2.5 2.435.59 3.435L8 10.25l-3.09 1.75.59-3.435L3 6.13l3.455-.5L8 2.5z"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
