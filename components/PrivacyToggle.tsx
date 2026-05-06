"use client";

import { useState } from "react";

interface Props {
  recipeId: string;
  initialIsPrivate: boolean;
}

export default function PrivacyToggle({ recipeId, initialIsPrivate }: Props) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !isPrivate;
    setIsPrivate(next); // optimistic
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_private: next }),
      });
      if (!res.ok) {
        setIsPrivate(!next); // revert
        setError("Konnte nicht gespeichert werden.");
      }
    } catch {
      setIsPrivate(!next);
      setError("Konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        onClick={handleToggle}
        disabled={saving}
        className={[
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest disabled:opacity-50",
          isPrivate ? "bg-stone-400" : "bg-stone-200",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
            isPrivate ? "translate-x-4.5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
      <span className="text-sm text-ink-secondary">
        {isPrivate ? "Privat (nicht geteilt)" : "Öffentlich (für Eingeladene sichtbar)"}
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
