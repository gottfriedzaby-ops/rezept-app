"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Step = "idle" | "confirm" | "deleting" | "done";

export default function UserSettingsActions() {
  const [signingOut, setSigningOut] = useState(false);
  const [deleteStep, setDeleteStep] = useState<Step>("idle");

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function handleDeleteConfirm() {
    setDeleteStep("deleting");
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setDeleteStep("done");
  }

  if (deleteStep === "done") {
    return (
      <div className="flex items-center gap-4 mt-4">
        <p className="text-sm text-ink-secondary">Kontolöschung wird bearbeitet.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 mt-4">
      {deleteStep === "idle" && (
        <>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-ink-secondary hover:text-ink-primary text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingOut ? "Abmelden…" : "Abmelden"}
          </button>
          <button
            type="button"
            onClick={() => setDeleteStep("confirm")}
            className="text-red-600 hover:text-red-700 text-sm transition-colors"
          >
            Konto löschen
          </button>
        </>
      )}

      {deleteStep === "confirm" && (
        <>
          <p className="text-sm text-ink-secondary">
            Bist du sicher? Alle Rezepte werden gelöscht.
          </p>
          <button
            type="button"
            onClick={handleDeleteConfirm}
            className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
          >
            Ja, löschen
          </button>
          <button
            type="button"
            onClick={() => setDeleteStep("idle")}
            className="text-ink-secondary hover:text-ink-primary text-sm transition-colors"
          >
            Abbrechen
          </button>
        </>
      )}

      {deleteStep === "deleting" && (
        <p className="text-sm text-ink-secondary">Wird gelöscht…</p>
      )}
    </div>
  );
}
