"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { AdminUserDetail, WindowKey } from "@/lib/admin-metrics";

const WINDOW_LABELS: Record<WindowKey, string> = {
  "24h": "24 Stunden",
  "7d": "7 Tage",
  "30d": "30 Tage",
  all: "Alle Zeiten",
};

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
const intFmt = new Intl.NumberFormat("de-DE");
const usdFmt = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

interface Props {
  userId: string;
  currentAdminId: string;
}

function isWindow(s: string | null | undefined): s is WindowKey {
  return s === "24h" || s === "7d" || s === "30d" || s === "all";
}

export default function UserDetailPanel({ userId, currentAdminId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawWindow = searchParams.get("window");
  const window: WindowKey = isWindow(rawWindow) ? rawWindow : "7d";

  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<
    | { kind: "idle" }
    | { kind: "pending"; action: string }
    | { kind: "confirming"; action: "delete" | "disable" }
    | { kind: "result"; message: string; tone: "ok" | "error" }
  >({ kind: "idle" });

  const isSelf = userId === currentAdminId;

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}?window=${window}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || json.error || !json.data) {
        setLoadError(json.error ?? "Nutzer konnte nicht geladen werden.");
        setDetail(null);
      } else {
        setDetail(json.data);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Daten konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId, window]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function setWindow(next: WindowKey) {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("window", next);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  async function runAction(action: "disable" | "enable" | "reset" | "delete") {
    setActionState({ kind: "pending", action });
    try {
      let res: Response;
      if (action === "disable" || action === "enable") {
        res = await fetch(`/api/admin/users/${userId}/disable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      } else if (action === "reset") {
        res = await fetch(`/api/admin/users/${userId}/reset-password`, {
          method: "POST",
        });
      } else {
        res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      }
      const json = await res.json();
      if (!res.ok || json.error) {
        setActionState({
          kind: "result",
          tone: "error",
          message: json.error ?? "Aktion fehlgeschlagen.",
        });
        return;
      }
      if (action === "delete") {
        router.replace("/settings/admin");
        return;
      }
      setActionState({
        kind: "result",
        tone: "ok",
        message:
          action === "disable"
            ? "Konto deaktiviert."
            : action === "enable"
              ? "Konto reaktiviert."
              : "Passwort-Reset-Mail ausgelöst.",
      });
      await refresh();
    } catch (err) {
      setActionState({
        kind: "result",
        tone: "error",
        message:
          err instanceof Error ? err.message : "Aktion fehlgeschlagen.",
      });
    }
  }

  if (loading && !detail) {
    return <p className="text-sm text-ink-tertiary">Lade Nutzerdaten…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {loadError}
      </p>
    );
  }
  if (!detail) return null;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/settings/admin?window=${window}`}
          className="text-sm text-ink-tertiary hover:text-ink-primary transition-colors"
        >
          ← Zurück zum Dashboard
        </Link>
        <div className="flex items-center gap-2" role="tablist" aria-label="Zeitraum">
          {(Object.keys(WINDOW_LABELS) as WindowKey[]).map((w) => (
            <button
              key={w}
              role="tab"
              aria-selected={window === w}
              onClick={() => setWindow(w)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                window === w
                  ? "bg-forest text-white border-forest"
                  : "border-stone text-ink-secondary hover:text-ink-primary hover:border-ink-tertiary"
              }`}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {/* User header */}
      <section className="rounded-xl border border-border-secondary p-5">
        <p className="font-serif text-xl font-medium text-ink-primary">
          {detail.email || "(keine E-Mail)"}
        </p>
        <p className="mt-1 text-xs text-ink-tertiary">
          Registriert am {dateFmt.format(new Date(detail.registered_at))} ·{" "}
          {detail.last_sign_in_at
            ? `Letzte Anmeldung ${dateTimeFmt.format(new Date(detail.last_sign_in_at))}`
            : "Noch nie angemeldet"}{" "}
          ·{" "}
          {detail.is_disabled ? (
            <span className="text-red-700">Deaktiviert</span>
          ) : (
            <span className="text-ink-secondary">Aktiv</span>
          )}
        </p>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Rezepte (gesamt)" value={intFmt.format(detail.recipes_lifetime)} />
        <Stat
          label={`Rezepte (${WINDOW_LABELS[window]})`}
          value={intFmt.format(detail.recipes_in_window)}
        />
        <Stat
          label={`API-Calls (${WINDOW_LABELS[window]})`}
          value={intFmt.format(detail.api_calls_in_window)}
        />
        <Stat
          label={`Kosten (${WINDOW_LABELS[window]})`}
          value={usdFmt.format(detail.cost_usd_in_window)}
        />
      </section>

      {/* Recipes by source */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          Rezepte nach Quelle ({WINDOW_LABELS[window]})
        </h3>
        {detail.recipes_by_source_in_window.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Keine Rezepte im Zeitraum.</p>
        ) : (
          <div className="rounded-xl border border-border-secondary overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Quelle</th>
                  <th className="px-4 py-2 text-right font-medium">Anzahl</th>
                </tr>
              </thead>
              <tbody>
                {detail.recipes_by_source_in_window.map((r) => (
                  <tr key={r.source_type} className="border-t border-border-secondary">
                    <td className="px-4 py-2 text-ink-primary">{r.source_type}</td>
                    <td className="px-4 py-2 text-right">{intFmt.format(r.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* API breakdown */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          Claude-API nach Funktion und Modell ({WINDOW_LABELS[window]})
        </h3>
        {detail.api_by_function_and_model_in_window.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Keine API-Aufrufe im Zeitraum.</p>
        ) : (
          <div className="rounded-xl border border-border-secondary overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Funktion</th>
                  <th className="px-4 py-2 text-left font-medium">Modell</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Input</th>
                  <th className="px-4 py-2 text-right font-medium">Output</th>
                  <th className="px-4 py-2 text-right font-medium">Cache-Read</th>
                  <th className="px-4 py-2 text-right font-medium">Cache-Write</th>
                  <th className="px-4 py-2 text-right font-medium">Kosten</th>
                </tr>
              </thead>
              <tbody>
                {detail.api_by_function_and_model_in_window.map((a) => (
                  <tr key={`${a.function}::${a.model}`} className="border-t border-border-secondary">
                    <td className="px-4 py-2 text-ink-primary">{a.function}</td>
                    <td className="px-4 py-2 text-ink-secondary font-mono text-xs">{a.model}</td>
                    <td className="px-4 py-2 text-right">{intFmt.format(a.count)}</td>
                    <td className="px-4 py-2 text-right">{intFmt.format(a.input_tokens)}</td>
                    <td className="px-4 py-2 text-right">{intFmt.format(a.output_tokens)}</td>
                    <td className="px-4 py-2 text-right">
                      {a.cache_read_tokens > 0 ? intFmt.format(a.cache_read_tokens) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {a.cache_creation_tokens > 0 ? intFmt.format(a.cache_creation_tokens) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {a.cost_usd === null ? (
                        <span className="text-ink-tertiary" title="Modell nicht in Preistabelle">
                          —
                        </span>
                      ) : (
                        usdFmt.format(a.cost_usd)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Actions */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          Aktionen
        </h3>
        {isSelf ? (
          <p className="text-sm text-ink-tertiary">
            Aktionen sind für das eigene Konto deaktiviert.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3">
              {detail.is_disabled ? (
                <ActionButton
                  onClick={() => runAction("enable")}
                  pending={actionState.kind === "pending" && actionState.action === "enable"}
                  label="Konto reaktivieren"
                />
              ) : (
                <ActionButton
                  onClick={() => setActionState({ kind: "confirming", action: "disable" })}
                  pending={actionState.kind === "pending" && actionState.action === "disable"}
                  label="Konto deaktivieren"
                />
              )}
              <ActionButton
                onClick={() => runAction("reset")}
                pending={actionState.kind === "pending" && actionState.action === "reset"}
                label="Passwort-Reset-Mail senden"
              />
              <ActionButton
                tone="danger"
                onClick={() => setActionState({ kind: "confirming", action: "delete" })}
                pending={actionState.kind === "pending" && actionState.action === "delete"}
                label="Nutzer löschen"
              />
            </div>

            {actionState.kind === "confirming" && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm">
                {actionState.action === "delete" ? (
                  <>
                    <p className="font-medium text-red-700">Diese Aktion kann nicht rückgängig gemacht werden.</p>
                    <p className="mt-1 text-red-700">
                      Alle Rezepte und Daten des Nutzers werden gelöscht. API-Aufrufe in der
                      Historie bleiben anonymisiert erhalten.
                    </p>
                  </>
                ) : (
                  <p className="text-red-700">
                    Der Nutzer kann sich nach der Deaktivierung nicht mehr anmelden. Daten
                    bleiben erhalten.
                  </p>
                )}
                <div className="mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => runAction(actionState.action)}
                    className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {actionState.action === "delete" ? "Ja, löschen" : "Ja, deaktivieren"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionState({ kind: "idle" })}
                    className="text-ink-secondary hover:text-ink-primary text-sm transition-colors px-3 py-2"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            )}

            {actionState.kind === "result" && (
              <p
                role="status"
                className={`text-sm ${
                  actionState.tone === "ok" ? "text-forest" : "text-red-700"
                }`}
              >
                {actionState.message}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-secondary p-4">
      <p className="text-xs text-ink-tertiary">{label}</p>
      <p className="mt-1 font-serif text-xl font-medium text-ink-primary">{value}</p>
    </div>
  );
}

function ActionButton({
  onClick,
  pending,
  label,
  tone = "default",
}: {
  onClick: () => void;
  pending: boolean;
  label: string;
  tone?: "default" | "danger";
}) {
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const palette =
    tone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-forest text-white hover:bg-forest-deep";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`${base} ${palette}`}
    >
      {pending ? "…" : label}
    </button>
  );
}
