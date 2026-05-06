"use client";

import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { toSchemaOrgRecipe, toPlainText } from "@/lib/schemaOrg";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function RecipeExportMenu({ recipe }: { recipe: Recipe }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  function downloadJson() {
    const json = JSON.stringify(toSchemaOrgRecipe(recipe), null, 2);
    const blob = new Blob([json], { type: "application/ld+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(recipe.title)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(toPlainText(recipe));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: textarea select
      const ta = document.createElement("textarea");
      ta.value = toPlainText(recipe);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-secondary transition-colors"
        aria-label="Exportieren"
        title="Exportieren"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-64 rounded-lg border border-stone bg-surface-primary shadow-lg py-1">
            <p className="px-3 pt-2 pb-1 text-[11px] text-ink-tertiary uppercase tracking-wide font-medium">
              Exportieren
            </p>
            <button
              type="button"
              onClick={downloadJson}
              className="w-full text-left px-3 py-2 text-sm text-ink-secondary hover:bg-surface-secondary hover:text-ink-primary transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              JSON-LD herunterladen
            </button>
            <button
              type="button"
              onClick={copyText}
              className="w-full text-left px-3 py-2 text-sm text-ink-secondary hover:bg-surface-secondary hover:text-ink-primary transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              {copied ? "Kopiert ✓" : "Als Text kopieren"}
            </button>
            <div className="mx-3 my-2 border-t border-stone" />
            <p className="px-3 pb-2 text-[11px] text-ink-tertiary leading-relaxed">
              Cookidoo bietet keine direkte Import-Funktion. Nutze den Text zum manuellen Übertragen.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
