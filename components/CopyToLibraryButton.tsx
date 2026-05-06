"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  recipeId: string;
}

type State = "idle" | "loading" | "done" | "error";

export default function CopyToLibraryButton({ recipeId }: Props) {
  const [state, setState] = useState<State>("idle");
  const [newId, setNewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/duplicate`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error ?? "Fehler beim Kopieren.");
        setState("error");
        return;
      }
      setNewId(json.data.id);
      setState("done");
    } catch {
      setError("Fehler beim Kopieren.");
      setState("error");
    }
  }

  if (state === "done" && newId) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-emerald-700">In deine Sammlung kopiert!</span>
        <Link
          href={`/${newId}`}
          className="text-sm font-medium text-forest hover:text-forest-deep transition-colors"
        >
          Rezept ansehen →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleCopy}
        disabled={state === "loading"}
        className="bg-forest text-white hover:bg-forest-deep px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "loading" ? "Wird kopiert…" : "In meine Sammlung kopieren"}
      </button>
      {state === "error" && error && (
        <p className="text-red-600 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
