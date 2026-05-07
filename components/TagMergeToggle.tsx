"use client";

import { useState } from "react";

interface Props {
  initialValue: boolean;
}

export default function TagMergeToggle({ initialValue }: Props) {
  const [enabled, setEnabled] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_shared_in_main_library: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert
        setError("Einstellung konnte nicht gespeichert werden.");
      }
    } catch {
      setEnabled(!next);
      setError("Einstellung konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
      <div className="flex items-start gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={saving}
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest disabled:opacity-50 shrink-0 mt-0.5",
            enabled ? "bg-forest" : "bg-stone-300",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-4.5" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
        <div>
          <p className="text-sm font-medium text-ink-primary">
            Geteilte Rezepte in meiner Bibliothek anzeigen
          </p>
          <p className="text-xs text-ink-tertiary mt-1 leading-relaxed">
            Wenn aktiviert, erscheinen Rezepte aus mit dir geteilten Sammlungen gemeinsam mit
            deinen eigenen Rezepten in der Bibliothek – erkennbar an einem Badge mit dem Namen
            der Person. Wenn deaktiviert, sind sie nur unter &bdquo;Geteilte Sammlungen&ldquo; erreichbar.
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
