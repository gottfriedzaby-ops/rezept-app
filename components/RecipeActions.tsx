"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Props {
  recipeId: string;
  initialFavorite: boolean;
}

export default function RecipeActions({ recipeId, initialFavorite }: Props) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) setIsFavorite(!next);
    } catch {
      setIsFavorite(!next);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/");
      } else {
        setDeleting(false);
        setConfirmOpen(false);
      }
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  const btnCls =
    "w-11 h-11 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-hover transition-colors";

  return (
    <>
      <div className="flex items-center gap-1 -mr-1">
        {/* Favorite */}
        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
          className={`${btnCls} ${isFavorite ? "text-amber-400 hover:text-amber-500" : ""}`}
        >
          {isFavorite ? (
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          )}
        </button>

        {/* Edit */}
        <Link href={`/${recipeId}/edit`} className={btnCls} aria-label="Rezept bearbeiten">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </Link>

        {/* Delete */}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label="Rezept löschen"
          className={btnCls}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h2m-5 4h8a2 2 0 002-2V7H4v8a2 2 0 002 2zM7 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 7h14" />
          </svg>
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Rezept löschen?"
        message="Das Rezept wird unwiderruflich gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden."
        confirmLabel={deleting ? "Wird gelöscht…" : "Löschen"}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
