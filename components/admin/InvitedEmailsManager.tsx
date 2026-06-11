"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface InvitedEmail {
  email: string;
  invited_at: string;
  registered_at: string | null;
}

interface Props {
  initialInvites: InvitedEmail[];
  inviteOnlyEnabled: boolean;
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

export default function InvitedEmailsManager({
  initialInvites,
  inviteOnlyEnabled,
}: Props) {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const [invites, setInvites] = useState<InvitedEmail[]>(initialInvites);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleAdd() {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setAddError(t("inviteMissingEmail"));
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/invited-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json()) as {
        data: InvitedEmail | null;
        error: string | null;
      };
      if (!res.ok || !json.data) {
        setAddError(json.error ?? t("inviteAddError"));
        return;
      }
      setInvites((prev) => [json.data!, ...prev]);
      setNewEmail("");
      setShowAdd(false);
    } catch {
      setAddError(t("inviteAddError"));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(email: string) {
    setDeletingEmail(email);
    try {
      const res = await fetch(
        `/api/admin/invited-emails/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setInvites((prev) => prev.filter((i) => i.email !== email));
      }
    } finally {
      setDeletingEmail(null);
      setConfirmDelete(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-ink-secondary">
            {inviteOnlyEnabled
              ? t("inviteOnlyEnabledHint")
              : t("inviteOnlyDisabledHint")}
          </p>
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="bg-forest text-white hover:bg-forest-deep px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t("invite")}
          </button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border-secondary bg-surface-primary p-5 mb-4">
          <p className="text-sm font-medium text-ink-primary mb-3">
            {t("inviteNewTitle")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t("inviteEmailPlaceholder")}
              className="input-field flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") {
                  setShowAdd(false);
                  setNewEmail("");
                  setAddError(null);
                }
              }}
              autoFocus
            />
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                className="bg-forest text-white hover:bg-forest-deep px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adding ? t("inviteSaving") : t("inviteAdd")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setNewEmail("");
                  setAddError(null);
                }}
                className="text-ink-secondary hover:text-ink-primary text-sm transition-colors px-3 py-2"
              >
                {tCommon("cancel")}
              </button>
            </div>
          </div>
          {addError && <p className="text-red-600 text-sm mt-2">{addError}</p>}
        </div>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-ink-tertiary py-2">
          {t("inviteEmpty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {invites.map((invite) => {
            const isDeleting = deletingEmail === invite.email;
            const isConfirming = confirmDelete === invite.email;
            return (
              <li
                key={invite.email}
                className="rounded-xl border border-border-secondary bg-surface-primary p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-primary truncate">
                      {invite.email}
                    </p>
                    <p className="text-xs text-ink-tertiary mt-0.5">
                      Eingeladen am{" "}
                      {dateFormatter.format(new Date(invite.invited_at))}
                      {invite.registered_at
                        ? ` · Registriert am ${dateFormatter.format(new Date(invite.registered_at))}`
                        : " · Noch nicht registriert"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {isConfirming ? (
                      <>
                        <span className="text-xs text-ink-tertiary">
                          Wirklich entfernen?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(invite.email)}
                          disabled={isDeleting}
                          className="text-red-600 hover:text-red-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDeleting ? "Entferne…" : "Ja, entfernen"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          disabled={isDeleting}
                          className="text-ink-secondary hover:text-ink-primary text-sm transition-colors"
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(invite.email)}
                        aria-label="Einladung entfernen"
                        className="text-red-600 hover:text-red-700 text-sm transition-colors"
                      >
                        Entfernen
                      </button>
                    )}
                  </div>
                </div>
                {isConfirming && invite.registered_at && (
                  <p className="text-xs text-ink-tertiary mt-3">
                    Hinweis: Die Person ist bereits registriert. Das Entfernen
                    dieser Einladung löscht das Nutzerkonto NICHT.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
