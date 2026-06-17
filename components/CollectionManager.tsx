"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CollectionIcon } from "@/lib/collection-icons";
import type { CollectionWithCount } from "@/types/collection";

interface CollectionManagerProps {
  collections: CollectionWithCount[];
}

export default function CollectionManager({ collections }: CollectionManagerProps) {
  const t = useTranslations("Collections");
  const router = useRouter();

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<CollectionWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
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
      setName("");
      router.refresh();
    } catch {
      setCreateError(t("createError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/collections/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError(t("pickerError"));
        return;
      }
      setPendingDelete(null);
      router.refresh();
    } catch {
      setDeleteError(t("pickerError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={handleCreate}
        className="mb-10 flex flex-col sm:flex-row gap-3 sm:items-start"
      >
        <div className="flex-1 sm:max-w-md">
          <input
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (createError) setCreateError(null);
            }}
            placeholder={t("createPlaceholder")}
            aria-label={t("createPlaceholder")}
            maxLength={100}
            className="input-field"
          />
          {createError && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {createError}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={creating || name.trim().length === 0}
          className="btn-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? t("creating") : t("create")}
        </button>
      </form>

      {collections.length === 0 ? (
        <p className="text-ink-secondary text-sm">{t("emptyState")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="relative rounded-xl border border-stone bg-surface-card p-5 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-forest-soft shrink-0">
                  <CollectionIcon name={collection.name} className="w-5 h-5 text-forest" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDelete(collection);
                  }}
                  aria-label={t("deleteAriaLabel")}
                  className="relative z-10 w-8 h-8 flex items-center justify-center rounded text-ink-tertiary hover:text-red-600 hover:bg-surface-hover transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 6h12M8.5 6V4.5A1.5 1.5 0 0 1 10 3a1.5 1.5 0 0 1 1.5 1.5V6m-6 0 .7 9.1A1.5 1.5 0 0 0 7.7 16.5h4.6a1.5 1.5 0 0 0 1.5-1.4L14.5 6"
                    />
                  </svg>
                </button>
              </div>
              <Link
                href={`/collections/${collection.id}`}
                className="font-medium text-ink-primary text-sm leading-snug break-words after:absolute after:inset-0 after:content-['']"
              >
                {collection.name}
              </Link>
              <p className="text-xs text-ink-tertiary mt-1">
                {t("recipeCount", { count: collection.recipe_count })}
              </p>
            </div>
          ))}
        </div>
      )}

      {deleteError && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {deleteError}
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("confirmDeleteTitle")}
        message={t("confirmDeleteMessage")}
        confirmLabel={deleting ? t("deleting") : t("delete")}
        destructive
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
      />
    </div>
  );
}
