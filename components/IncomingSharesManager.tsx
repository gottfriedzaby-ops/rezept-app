"use client";

import { useState } from "react";
import Link from "next/link";
import type { LibraryShareInbound } from "@/types/library-sharing";

interface Props {
  initialShares: LibraryShareInbound[];
}

export default function IncomingSharesManager({ initialShares }: Props) {
  const [shares, setShares] = useState<LibraryShareInbound[]>(initialShares);
  const [actingId, setActingId] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/library-shares/${id}/accept`, { method: "POST" });
      if (res.ok) {
        setShares((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "accepted" as const } : s))
        );
      }
    } finally {
      setActingId(null);
    }
  }

  async function handleDecline(id: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/library-shares/${id}/decline`, { method: "POST" });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setActingId(null);
    }
  }

  async function handleLeave(id: string) {
    setActingId(id);
    try {
      const res = await fetch(`/api/library-shares/${id}/leave`, { method: "POST" });
      if (res.ok) {
        setShares((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setActingId(null);
    }
  }

  if (shares.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        Du hast noch keine geteilten Sammlungen erhalten.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {shares.map((share) => {
        const ownerLabel = share.owner_display_name ?? share.owner_email;
        const isActing = actingId === share.id;

        return (
          <li
            key={share.id}
            className="rounded-xl border border-border-secondary bg-surface-primary p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-primary">{ownerLabel}</p>
                {share.owner_display_name && (
                  <p className="text-xs text-ink-tertiary">{share.owner_email}</p>
                )}
                <p className="text-xs text-ink-tertiary mt-0.5">
                  {share.status === "accepted" ? "Aktiver Zugriff" : "Einladung ausstehend"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {share.status === "accepted" && (
                  <>
                    <Link
                      href={`/library-shares/${share.owner_id}`}
                      className="bg-forest text-white hover:bg-forest-deep px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      Sammlung ansehen
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleLeave(share.id)}
                      disabled={isActing}
                      className="text-red-600 hover:text-red-700 text-sm transition-colors disabled:opacity-50 px-2"
                    >
                      {isActing ? "…" : "Verlassen"}
                    </button>
                  </>
                )}
                {share.status === "pending" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAccept(share.id)}
                      disabled={isActing}
                      className="bg-forest text-white hover:bg-forest-deep px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {isActing ? "…" : "Annehmen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(share.id)}
                      disabled={isActing}
                      className="text-ink-secondary hover:text-ink-primary text-sm transition-colors disabled:opacity-50 px-2"
                    >
                      Ablehnen
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
