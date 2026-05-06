"use client";

import { useState } from "react";
import type { LibraryShareOutbound, ReshareRequest } from "@/types/library-sharing";

interface Props {
  initialShares: LibraryShareOutbound[];
  reshareRequests: ReshareRequest[];
}

const dateFormatter = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });

type BadgeVariant = "amber" | "green" | "gray";

function StatusBadge({ label, variant }: { label: string; variant: BadgeVariant }) {
  const cls =
    variant === "amber"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : variant === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-stone-50 text-stone-500 border-stone-200";
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${cls}`}>{label}</span>
  );
}

function shareStatusBadge(share: LibraryShareOutbound) {
  if (share.status === "accepted") return <StatusBadge label="Aktiv" variant="green" />;
  if (share.status === "pending") {
    const label = share.recipient_id ? "Ausstehend" : "Ausstehend (nicht registriert)";
    return <StatusBadge label={label} variant="amber" />;
  }
  if (share.status === "declined") return <StatusBadge label="Abgelehnt" variant="gray" />;
  if (share.status === "left") return <StatusBadge label="Verlassen" variant="gray" />;
  return null;
}

export default function LibraryShareManager({ initialShares, reshareRequests }: Props) {
  const [shares, setShares] = useState<LibraryShareOutbound[]>(initialShares);
  const [requests, setRequests] = useState<ReshareRequest[]>(reshareRequests);
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  async function handleSendInvitation(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSending(true);
    try {
      const res = await fetch("/api/library-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient_email: emailInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSendError(json.error ?? "Einladung konnte nicht gesendet werden.");
        return;
      }
      setShares((prev) => [{ ...json.data, recipient_display_name: null }, ...prev]);
      setEmailInput("");
    } catch {
      setSendError("Einladung konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/library-shares/${id}`, { method: "DELETE" });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setRevokingId(null);
    }
  }

  async function handleApproveReshare(id: string) {
    setResolvingId(id);
    try {
      const res = await fetch(`/api/library-shares/reshare-requests/${id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setResolvingId(null);
    }
  }

  async function handleRejectReshare(id: string) {
    setResolvingId(id);
    try {
      const res = await fetch(`/api/library-shares/reshare-requests/${id}/reject`, {
        method: "POST",
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      }
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Send invitation */}
      <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
        <p className="text-sm font-medium text-ink-primary mb-3">Einladung senden</p>
        <form onSubmit={handleSendInvitation} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="E-Mail-Adresse"
            required
            className="input-field flex-1"
          />
          <button
            type="submit"
            disabled={sending}
            className="bg-forest text-white hover:bg-forest-deep px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? "Wird gesendet…" : "Einladung senden"}
          </button>
        </form>
        {sendError && (
          <p className="text-red-600 text-sm mt-2">{sendError}</p>
        )}
      </div>

      {/* Outbound share list */}
      {shares.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Du hast noch keine Bibliotheks-Einladungen gesendet.</p>
      ) : (
        <ul className="space-y-3">
          {shares.map((share) => (
            <li
              key={share.id}
              className="rounded-xl border border-border-secondary bg-surface-primary p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-ink-primary truncate">
                      {share.recipient_display_name ?? share.recipient_email}
                    </p>
                    {shareStatusBadge(share)}
                  </div>
                  {share.recipient_display_name && (
                    <p className="text-xs text-ink-tertiary">{share.recipient_email}</p>
                  )}
                  <p className="text-xs text-ink-tertiary mt-0.5">
                    Eingeladen am {dateFormatter.format(new Date(share.invited_at))}
                  </p>
                </div>
                {(share.status === "pending" || share.status === "accepted") && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(share.id)}
                    disabled={revokingId === share.id}
                    className="text-red-600 hover:text-red-700 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {revokingId === share.id ? "Wird entzogen…" : "Zugriff entziehen"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pending reshare requests */}
      {requests.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
            Weitergabe-Anfragen
          </p>
          <ul className="space-y-3">
            {requests.map((req) => (
              <li
                key={req.id}
                className="rounded-xl border border-amber-200 bg-amber-50 p-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-primary">
                      Anfrage, deine Sammlung an{" "}
                      <span className="font-medium">{req.target_email}</span> weiterzugeben.
                    </p>
                    <p className="text-xs text-ink-tertiary mt-0.5">
                      {dateFormatter.format(new Date(req.created_at))}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleApproveReshare(req.id)}
                      disabled={resolvingId === req.id}
                      className="bg-forest text-white hover:bg-forest-deep px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Genehmigen
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectReshare(req.id)}
                      disabled={resolvingId === req.id}
                      className="text-red-600 hover:text-red-700 text-sm transition-colors disabled:opacity-50 px-2"
                    >
                      Ablehnen
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
