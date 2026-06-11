"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import type { CollectionWithCount } from "@/types/collection";

type PickerCollection = CollectionWithCount & { contains_recipe: boolean };

interface CollectionPickerProps {
  recipeId: string;
}

export default function CollectionPicker({ recipeId }: CollectionPickerProps) {
  const t = useTranslations("Collections");

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [collections, setCollections] = useState<PickerCollection[]>([]);
  const [actionError, setActionError] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await fetch(`/api/collections?recipe_id=${encodeURIComponent(recipeId)}`);
      const json = await res.json();
      if (!res.ok || json.error || !json.data) throw new Error(json.error ?? "load failed");
      setCollections(json.data as PickerCollection[]);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  function handleOpen() {
    setOpen(true);
    setActionError(false);
    setCreateError(null);
    void loadCollections();
  }

  function handleClose() {
    setOpen(false);
  }

  async function toggleMembership(collection: PickerCollection) {
    const next = !collection.contains_recipe;
    setActionError(false);
    // Optimistic flip — reverted below when the request fails.
    setCollections((prev) =>
      prev.map((c) => (c.id === collection.id ? { ...c, contains_recipe: next } : c))
    );
    try {
      const res = await fetch(`/api/collections/${collection.id}/recipes`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId }),
      });
      if (!res.ok) throw new Error("toggle failed");
    } catch {
      setCollections((prev) =>
        prev.map((c) => (c.id === collection.id ? { ...c, contains_recipe: !next } : c))
      );
      setActionError(true);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        setCreateError(res.status === 409 ? t("duplicateName") : t("createError"));
        return;
      }
      setNewName("");
      await loadCollections();
    } catch {
      setCreateError(t("createError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded border border-stone text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path d="M17 16H3a1.5 1.5 0 0 1-1.5-1.5v-10A1.5 1.5 0 0 1 3 3h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 17 16z" />
          <path strokeLinecap="round" d="M10 8v5M7.5 10.5h5" />
        </svg>
        {t("pickerButton")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={handleClose}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-picker-title"
            className="relative bg-surface-card rounded-lg shadow-lg border border-stone p-6 max-w-sm w-full mx-4 max-h-[80vh] flex flex-col"
          >
            <h2
              id="collection-picker-title"
              className="font-serif text-lg font-medium text-ink-primary mb-4"
            >
              {t("pickerTitle")}
            </h2>

            {loading ? (
              <div className="flex justify-center py-6" role="status">
                <div
                  className="w-6 h-6 border-2 border-stone border-t-forest rounded-full animate-spin"
                  aria-hidden="true"
                />
              </div>
            ) : loadFailed ? (
              <div role="alert" className="py-2">
                <button
                  type="button"
                  onClick={() => void loadCollections()}
                  className="text-sm text-red-600 underline underline-offset-2 text-left"
                >
                  {t("loadError")}
                </button>
              </div>
            ) : (
              <>
                {collections.length === 0 ? (
                  <p className="text-sm text-ink-secondary">{t("pickerEmpty")}</p>
                ) : (
                  <ul className="overflow-y-auto -mx-2 px-2 space-y-1">
                    {collections.map((collection) => (
                      <li key={collection.id}>
                        <label className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface-hover transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            checked={collection.contains_recipe}
                            onChange={() => void toggleMembership(collection)}
                            className="w-4 h-4 accent-forest shrink-0"
                          />
                          <span className="text-sm text-ink-primary leading-snug min-w-0 break-words">
                            {collection.name}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {actionError && (
                  <p role="alert" className="mt-3 text-sm text-red-600">
                    {t("pickerError")}
                  </p>
                )}
              </>
            )}

            <form onSubmit={handleCreate} className="mt-4 pt-4 border-t border-stone">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder={t("createPlaceholder")}
                  aria-label={t("createPlaceholder")}
                  maxLength={100}
                  className="input-field flex-1"
                />
                <button
                  type="submit"
                  disabled={creating || newName.trim().length === 0}
                  className="btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? t("creating") : t("create")}
                </button>
              </div>
              {createError && (
                <p role="alert" className="mt-2 text-sm text-red-600">
                  {createError}
                </p>
              )}
            </form>

            <button type="button" onClick={handleClose} className="btn-ghost mt-4">
              {t("pickerClose")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
