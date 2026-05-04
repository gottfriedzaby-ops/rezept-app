"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/types/recipe";
import RecipeReviewForm from "@/components/RecipeReviewForm";

type Phase = "input" | "loading" | "review" | "success";

interface ParseResult {
  recipe: ParsedRecipe;
  sourceTitle: string;
}

export default function ImportYoutube() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch("/api/import-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as { data: ParseResult | null; error: string | null };

      if (json.error || !json.data) {
        setError(json.error ?? "Import fehlgeschlagen");
        setPhase("input");
      } else {
        setParseResult(json.data);
        setPhase("review");
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
      setPhase("input");
    }
  }

  async function handleSave(recipe: ParsedRecipe) {
    if (!parseResult) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/recipes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, sourceTitle: parseResult.sourceTitle }),
      });
      const json = (await res.json()) as { data: unknown; error: string | null };

      if (json.error) {
        setError(json.error);
      } else {
        setPhase("success");
        router.refresh();
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setParseResult(null);
    setError(null);
    setPhase("input");
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-green-600">Rezept erfolgreich gespeichert!</p>
        <button
          type="button"
          onClick={() => { setUrl(""); setPhase("input"); }}
          className="self-start text-xs text-red-600 hover:underline"
        >
          Weiteres Rezept importieren
        </button>
      </div>
    );
  }

  if (phase === "review" && parseResult) {
    return (
      <RecipeReviewForm
        initial={parseResult.recipe}
        saving={saving}
        error={error}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 max-w-xl">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          required
          disabled={phase === "loading"}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={phase === "loading" || !url}
          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {phase === "loading" ? "Importiere…" : "Importieren"}
        </button>
      </div>
      {phase === "loading" && (
        <p className="text-xs text-gray-400">
          Transkript wird abgerufen und verarbeitet — das kann etwas dauern…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
