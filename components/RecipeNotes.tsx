"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface RecipeNotesProps {
  recipeId: string;
  initialNotes: string | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// Owner-only personal notes ("Margin notes": tweaks, substitutions, verdicts).
export default function RecipeNotes({ recipeId, initialNotes }: RecipeNotesProps) {
  const t = useTranslations("RecipeDetail");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [state, setState] = useState<SaveState>("idle");

  const dirty = notes !== savedNotes;

  async function save() {
    if (!dirty || state === "saving") return;
    setState("saving");
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() === "" ? null : notes }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setSavedNotes(notes);
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-8 pt-8 border-t border-stone">
      <label htmlFor="recipe-notes" className="label-overline block mb-3">
        {t("notesLabel")}
      </label>
      <textarea
        id="recipe-notes"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          if (state !== "idle") setState("idle");
        }}
        rows={3}
        maxLength={2000}
        placeholder={t("notesPlaceholder")}
        className="input-field min-h-[5rem] resize-y"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || state === "saving"}
          className="btn-ghost px-4 py-1.5 text-sm"
        >
          {state === "saving" ? t("notesSaving") : t("notesSave")}
        </button>
        {state === "saved" && !dirty && (
          <span className="text-sm text-forest">{t("notesSaved")}</span>
        )}
        {state === "error" && (
          <span className="text-sm text-red-600" role="alert">
            {t("notesError")}
          </span>
        )}
      </div>
    </div>
  );
}
