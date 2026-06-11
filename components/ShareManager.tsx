"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface Share {
  id: string;
  created_at: string;
  token: string;
  label: string | null;
  revoked_at: string | null;
}

interface Props {
  initialShares: Share[];
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export default function ShareManager({ initialShares }: Props) {
  const t = useTranslations("ShareManager");
  const tCommon = useTranslations("Common");
  const [shares, setShares] = useState<Share[]>(initialShares);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function getShareUrl(token: string): string {
    return window.location.origin + "/shared/" + token;
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() || undefined }),
      });
      const json = (await res.json()) as { data: Share; error: string | null };
      if (!res.ok || json.error) {
        setCreateError(t("createError"));
        return;
      }
      setShares((prev) => [json.data, ...prev]);
      setNewLabel("");
      setShowCreate(false);
    } catch {
      setCreateError(t("createError"));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/shares/${id}`, { method: "DELETE" });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopy(token: string, id: string) {
    try {
      await navigator.clipboard.writeText(getShareUrl(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // clipboard not available — fail silently
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">
          {t("title")}
        </p>
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="bg-forest text-white hover:bg-forest-deep px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t("createNew")}
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showCreate && (
        <div className="rounded-xl border border-border-secondary bg-surface-primary p-5 mb-4">
          <p className="text-sm font-medium text-ink-primary mb-3">{t("createNew")}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("labelPlaceholder")}
              className="input-field flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowCreate(false);
              }}
              autoFocus
            />
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="bg-forest text-white hover:bg-forest-deep px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? t("creating") : t("create")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setNewLabel("");
                  setCreateError(null);
                }}
                className="text-ink-secondary hover:text-ink-primary text-sm transition-colors px-3 py-2"
              >
                {tCommon("cancel")}
              </button>
            </div>
          </div>
          {createError && (
            <p className="text-red-600 text-sm mt-2">{createError}</p>
          )}
        </div>
      )}

      {/* Share list */}
      {shares.length === 0 ? (
        <p className="text-sm text-ink-tertiary py-2">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {shares.map((share) => {
            const url = getShareUrl(share.token);
            const isCopied = copiedId === share.id;
            const isRevoking = revokingId === share.id;

            return (
              <li
                key={share.id}
                className="rounded-xl border border-border-secondary bg-surface-primary p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-primary truncate">
                      {share.label ?? t("fallbackLabel")}
                    </p>
                    <p className="text-xs text-ink-tertiary mt-0.5">
                      {t("createdOn", {
                        date: dateFormatter.format(new Date(share.created_at)),
                      })}
                    </p>
                    <p className="text-xs text-ink-tertiary mt-1.5 font-mono truncate">
                      {url}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(share.token, share.id)}
                      aria-label={t("copyAriaLabel")}
                      className="text-ink-secondary hover:text-ink-primary text-sm transition-colors"
                    >
                      {isCopied ? t("copied") : t("copy")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      disabled={isRevoking}
                      aria-label={t("revokeAriaLabel")}
                      className="text-red-600 hover:text-red-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRevoking ? t("revoking") : t("revoke")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
