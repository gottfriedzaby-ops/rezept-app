"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type {
  AdminUserRow,
  DashboardMetrics,
  WindowKey,
} from "@/lib/admin-metrics";

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

function isWindow(s: string | null | undefined): s is WindowKey {
  return s === "24h" || s === "7d" || s === "30d" || s === "all";
}

export default function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawWindow = searchParams.get("window");
  const window: WindowKey = isWindow(rawWindow) ? rawWindow : "7d";

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setWindow = useCallback(
    (next: WindowKey) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("window", next);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [m, u] = await Promise.all([
          fetch(`/api/admin/metrics?window=${window}`, { cache: "no-store" }).then(
            (r) => r.json(),
          ),
          fetch(`/api/admin/users?window=${window}`, { cache: "no-store" }).then(
            (r) => r.json(),
          ),
        ]);
        if (cancelled) return;
        if (m?.error || !m?.data) {
          setLoadError(m?.error ?? "Metriken konnten nicht geladen werden.");
        } else {
          setMetrics(m.data);
        }
        if (u?.error || !u?.data) {
          setLoadError((prev) => prev ?? u?.error ?? null);
        } else {
          setUsers(u.data);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Daten konnten nicht geladen werden.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [window]);

  const [sortBy, setSortBy] = useState<
    "cost" | "email" | "registered" | "last_sign_in" | "recipes" | "api_calls" | "status"
  >("cost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedUsers = useMemo(() => {
    if (!users) return null;
    const copy = [...users];
    const cmpStr = (a: string, b: string) => a.localeCompare(b, "de");
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortBy) {
        case "email":
          return cmpStr(a.email, b.email) * dir;
        case "registered":
          return (
            (new Date(a.registered_at).getTime() -
              new Date(b.registered_at).getTime()) *
            dir
          );
        case "last_sign_in":
          return (
            ((a.last_sign_in_at
              ? new Date(a.last_sign_in_at).getTime()
              : 0) -
              (b.last_sign_in_at
                ? new Date(b.last_sign_in_at).getTime()
                : 0)) *
            dir
          );
        case "recipes":
          return (a.recipes_lifetime - b.recipes_lifetime) * dir;
        case "api_calls":
          return (a.api_calls_in_window - b.api_calls_in_window) * dir;
        case "status":
          return (Number(a.is_disabled) - Number(b.is_disabled)) * dir;
        case "cost":
        default:
          return (a.cost_usd_in_window - b.cost_usd_in_window) * dir;
      }
    });
    return copy;
  }, [users, sortBy, sortDir]);

  function toggleSort(col: typeof sortBy) {
    if (col === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "email" ? "asc" : "desc");
    }
  }

  return (
    <div className="space-y-12">
      {/* Window selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-medium text-ink-primary">
          Admin Dashboard
        </h2>
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

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700"
        >
          {loadError}
        </div>
      )}

      {loading && !metrics && (
        <p className="text-sm text-ink-tertiary">Lade Daten…</p>
      )}

      {metrics && (
        <>
          {/* Section 1 — User Activity */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
              Nutzeraktivität
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat
                label="Registrierte Nutzer (gesamt)"
                value={intFmt.format(metrics.userActivity.totalRegisteredUsers)}
                subtle
              />
              <Stat
                label={`Neue Nutzer (${WINDOW_LABELS[window]})`}
                value={intFmt.format(metrics.userActivity.newUsersInWindow)}
              />
              <Stat
                label={`Aktive Nutzer (${WINDOW_LABELS[window]})`}
                value={intFmt.format(metrics.userActivity.activeUsersInWindow)}
              />
              <Stat
                label={`Rezepte (${WINDOW_LABELS[window]})`}
                value={intFmt.format(metrics.userActivity.recipesCreatedInWindow)}
              />
            </div>
          </section>

          {/* Section 2 — Recipe Usage */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
              Rezepte ({WINDOW_LABELS[window]})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border-secondary p-5">
                <p className="text-xs text-ink-tertiary mb-3">Nach Quelle</p>
                {metrics.recipeUsage.bySourceType.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">Keine Rezepte im Zeitraum.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {metrics.recipeUsage.bySourceType.map((row) => (
                      <li key={row.source_type} className="flex justify-between">
                        <span className="text-ink-primary">{row.source_type}</span>
                        <span className="text-ink-secondary">
                          {intFmt.format(row.count)}{" "}
                          <span className="text-ink-tertiary">
                            ({row.percentage.toFixed(1)}%)
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-border-secondary p-5">
                <p className="text-xs text-ink-tertiary mb-3">
                  Top-Tags &nbsp;·&nbsp; Aktive Sammlungs-Links (gesamt):{" "}
                  <span className="text-ink-primary">
                    {intFmt.format(metrics.recipeUsage.totalActiveShares)}
                  </span>
                </p>
                {metrics.recipeUsage.topTags.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">Keine Tags im Zeitraum.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {metrics.recipeUsage.topTags.map((t) => (
                      <li key={t.tag} className="flex justify-between">
                        <span className="text-ink-primary">{t.tag}</span>
                        <span className="text-ink-secondary">{intFmt.format(t.count)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Section 3 — API & Token Usage */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
              Claude-API ({WINDOW_LABELS[window]})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Stat label="Calls gesamt" value={intFmt.format(metrics.apiUsage.totalCalls)} />
              <Stat
                label="Eindeutige Nutzer"
                value={intFmt.format(metrics.apiUsage.uniqueUsersWithCalls)}
              />
              <Stat
                label="Erfolg"
                value={intFmt.format(metrics.apiUsage.successCount)}
              />
              <Stat
                label="Fehler"
                value={intFmt.format(metrics.apiUsage.errorCount)}
                tone={metrics.apiUsage.errorCount > 0 ? "warn" : "default"}
              />
            </div>
            {metrics.apiUsage.callsByFunction.length === 0 ? (
              <p className="text-sm text-ink-tertiary">Keine API-Aufrufe im Zeitraum.</p>
            ) : (
              <div className="rounded-xl border border-border-secondary overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-tertiary">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Funktion</th>
                      <th className="px-4 py-2 text-right font-medium">Calls</th>
                      <th className="px-4 py-2 text-right font-medium">Anteil</th>
                      <th className="px-4 py-2 text-right font-medium">Input-Tokens</th>
                      <th className="px-4 py-2 text-right font-medium">Output-Tokens</th>
                      <th className="px-4 py-2 text-right font-medium">Cache-Read</th>
                      <th className="px-4 py-2 text-right font-medium">Cache-Write</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.apiUsage.callsByFunction.map((f) => (
                      <tr key={f.function} className="border-t border-border-secondary">
                        <td className="px-4 py-2 text-ink-primary font-medium">{f.function}</td>
                        <td className="px-4 py-2 text-right">{intFmt.format(f.count)}</td>
                        <td className="px-4 py-2 text-right text-ink-tertiary">
                          {f.percentage.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2 text-right">{intFmt.format(f.input_tokens)}</td>
                        <td className="px-4 py-2 text-right">{intFmt.format(f.output_tokens)}</td>
                        <td className="px-4 py-2 text-right">
                          {f.cache_read_tokens > 0 ? intFmt.format(f.cache_read_tokens) : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {f.cache_creation_tokens > 0
                            ? intFmt.format(f.cache_creation_tokens)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Section 4 — Cost */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
              Geschätzte Kosten ({WINDOW_LABELS[window]})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Stat
                label="Summe (USD)"
                value={usdFmt.format(metrics.cost.totalUsd)}
              />
              {metrics.cost.unpricedModelCalls > 0 && (
                <Stat
                  label="Calls ohne Preis"
                  value={intFmt.format(metrics.cost.unpricedModelCalls)}
                  tone="warn"
                />
              )}
            </div>
            {metrics.cost.breakdown.length === 0 ? (
              <p className="text-sm text-ink-tertiary">Keine Kosten im Zeitraum.</p>
            ) : (
              <div className="rounded-xl border border-border-secondary overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-tertiary">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Funktion</th>
                      <th className="px-4 py-2 text-left font-medium">Modell</th>
                      <th className="px-4 py-2 text-right font-medium">Kosten (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.cost.breakdown.map((b) => (
                      <tr
                        key={`${b.function}::${b.model}`}
                        className="border-t border-border-secondary"
                      >
                        <td className="px-4 py-2 text-ink-primary">{b.function}</td>
                        <td className="px-4 py-2 text-ink-secondary font-mono text-xs">
                          {b.model}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {b.cost_usd === null ? (
                            <span
                              className="text-ink-tertiary"
                              title="Modell nicht in Preistabelle"
                            >
                              —
                            </span>
                          ) : (
                            usdFmt.format(b.cost_usd)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* User table */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-3">
          Nutzer
        </h3>
        {!sortedUsers ? (
          loading ? (
            <p className="text-sm text-ink-tertiary">Lade Nutzerliste…</p>
          ) : null
        ) : sortedUsers.length === 0 ? (
          <p className="text-sm text-ink-tertiary">Keine Nutzer.</p>
        ) : (
          <div className="rounded-xl border border-border-secondary overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs uppercase tracking-wider text-ink-tertiary">
                <tr>
                  <SortableTh active={sortBy === "email"} dir={sortDir} onClick={() => toggleSort("email")}>
                    E-Mail
                  </SortableTh>
                  <SortableTh active={sortBy === "registered"} dir={sortDir} onClick={() => toggleSort("registered")}>
                    Registriert
                  </SortableTh>
                  <SortableTh active={sortBy === "last_sign_in"} dir={sortDir} onClick={() => toggleSort("last_sign_in")}>
                    Letzte Anmeldung
                  </SortableTh>
                  <SortableTh active={sortBy === "recipes"} dir={sortDir} onClick={() => toggleSort("recipes")} align="right">
                    Rezepte
                  </SortableTh>
                  <SortableTh active={sortBy === "api_calls"} dir={sortDir} onClick={() => toggleSort("api_calls")} align="right">
                    API-Calls
                  </SortableTh>
                  <SortableTh active={sortBy === "cost"} dir={sortDir} onClick={() => toggleSort("cost")} align="right">
                    Kosten
                  </SortableTh>
                  <SortableTh active={sortBy === "status"} dir={sortDir} onClick={() => toggleSort("status")}>
                    Status
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-border-secondary hover:bg-surface-hover transition-colors"
                  >
                    <td className="px-4 py-2">
                      <Link
                        href={`/settings/admin/users/${u.id}?window=${window}`}
                        className="text-forest hover:text-forest-deep"
                      >
                        {u.email || "(keine E-Mail)"}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-ink-secondary">
                      {dateFmt.format(new Date(u.registered_at))}
                    </td>
                    <td className="px-4 py-2 text-ink-secondary">
                      {u.last_sign_in_at
                        ? dateTimeFmt.format(new Date(u.last_sign_in_at))
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">{intFmt.format(u.recipes_lifetime)}</td>
                    <td className="px-4 py-2 text-right">
                      {intFmt.format(u.api_calls_in_window)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {usdFmt.format(u.cost_usd_in_window)}
                    </td>
                    <td className="px-4 py-2">
                      {u.is_disabled ? (
                        <span className="text-red-700 text-xs">Deaktiviert</span>
                      ) : (
                        <span className="text-ink-tertiary text-xs">Aktiv</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {metrics && (
        <p className="text-xs text-ink-tertiary">
          Aktualisiert {dateTimeFmt.format(new Date(metrics.generatedAt))}.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  subtle,
  tone,
}: {
  label: string;
  value: string;
  subtle?: boolean;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        subtle
          ? "border-border-secondary bg-surface-secondary"
          : "border-border-secondary bg-surface-primary"
      }`}
    >
      <p className="text-xs text-ink-tertiary">{label}</p>
      <p
        className={`mt-1 font-serif text-xl font-medium ${
          tone === "warn" ? "text-red-700" : "text-ink-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SortableTh({
  active,
  dir,
  onClick,
  children,
  align = "left",
}: {
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${
          active ? "text-ink-primary" : "text-ink-tertiary"
        } hover:text-ink-primary transition-colors`}
      >
        {children}
        {active && <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}
