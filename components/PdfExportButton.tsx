"use client";

import { useState } from "react";
import type { Recipe } from "@/types/recipe";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function PdfExportButton({ recipe }: { recipe: Recipe }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleDownload() {
    setLoading(true);
    setError(false);
    try {
      const [{ pdf }, { default: RecipePdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./RecipePdfDocument"),
      ]);
      const blob = await pdf(<RecipePdfDocument recipe={recipe} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(recipe.title)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        aria-label="PDF exportieren"
        className="w-10 h-10 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        title="PDF exportieren"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3m0 0l3-3m-3 3V4" />
          </svg>
        )}
      </button>
      {error && (
        <p className="absolute right-0 top-11 text-xs text-red-600 w-[140px] text-right leading-snug">
          PDF konnte nicht erstellt werden. Bitte versuche es erneut.
        </p>
      )}
    </div>
  );
}
