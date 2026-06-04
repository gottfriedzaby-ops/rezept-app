"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  getList,
  toggleItem,
  setItemsChecked,
  getSortMode,
  setSortMode,
  notifyListChanged,
  type ShoppingListItem,
  type SortMode,
} from "@/lib/shopping-list";
import { buildGroups, formatRowAmount, type ViewGroup, type ViewRow } from "@/lib/shopping-list-view";
import { getLearnedCategories, CATEGORY_BY_ID, type CategoryId } from "@/lib/ingredient-categories";
import { useAutoCategorize } from "@/lib/useAutoCategorize";

function playBeep() {
  try {
    const ctx = new AudioContext();
    [0, 0.12, 0.24].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      // Rising three-note flourish for the "done" moment.
      osc.frequency.value = 660 + i * 220;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch {
    // Web Audio not available
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // unsupported / blocked
  }
}

interface ShopRowProps {
  row: ViewRow;
  fromSourcesLabel: string | null;
  reduceMotion: boolean;
  onToggle: (row: ViewRow) => void;
}

function ShopRow({ row, fromSourcesLabel, reduceMotion, onToggle }: ShopRowProps) {
  const label = formatRowAmount(row.amount, row.unit, row.displayName);
  return (
    <li>
      <button
        type="button"
        onClick={() => onToggle(row)}
        aria-pressed={row.checked}
        aria-label={label}
        className="w-full flex items-center gap-4 h-14 px-3 text-left rounded-lg hover:bg-surface-hover transition-colors"
      >
        <span
          className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition-colors ${
            row.checked ? "bg-forest border-forest text-white" : "border-stone text-transparent"
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className={`w-4 h-4 ${row.checked && !reduceMotion ? "shopping-pop" : ""}`}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5l3 3 7-7" />
          </svg>
        </span>
        <span
          className={`flex-1 min-w-0 ${
            row.checked ? "line-through text-ink-tertiary" : "text-ink-primary"
          }`}
        >
          <span className="text-base">{label}</span>
          {row.sourceCount > 1 && fromSourcesLabel && (
            <span className="ml-2 text-xs text-ink-tertiary">{fromSourcesLabel}</span>
          )}
        </span>
      </button>
    </li>
  );
}

export default function ShoppingMode() {
  const t = useTranslations("ShoppingMode");
  const tCat = useTranslations("ShoppingCategories");

  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [sortMode, setSortModeState] = useState<SortMode>("recipe");
  const [learned, setLearned] = useState<Record<string, CategoryId>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [celebrating, setCelebrating] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const manuallyToggled = useRef<Set<string>>(new Set());
  const prevAllDone = useRef(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setItems(getList()), []);

  // SSR-safe mount: hydrate from localStorage.
  useEffect(() => {
    setItems(getList());
    setSortModeState(getSortMode());
    setLearned(getLearnedCategories());
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  }, []);

  // Wake Lock — keep the screen on while shopping (same approach as CookMode).
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sentinel: any = null;
    let mounted = true;

    const acquire = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        if ("wakeLock" in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lock = await (navigator as any).wakeLock.request("screen");
          if (!mounted) {
            lock.release().catch(() => {});
            return;
          }
          sentinel = lock;
        }
      } catch {
        /* not supported or denied */
      }
    };

    acquire();
    const onVisChange = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisChange);
      sentinel?.release().catch(() => {});
    };
  }, []);

  useAutoCategorize(items, sortMode, setLearned);

  const groups = useMemo(
    () => buildGroups(items, sortMode, learned),
    [items, sortMode, learned]
  );

  // Checked rows sink to the bottom of their section (kept here, not in the view
  // model, so the plain list page is unaffected).
  const displayGroups = useMemo(
    () =>
      groups.map((g) => ({
        ...g,
        rows: [...g.rows.filter((r) => !r.checked), ...g.rows.filter((r) => r.checked)],
      })),
    [groups]
  );

  const total = items.length;
  const done = items.filter((i) => i.checked).length;
  const allDone = total > 0 && done === total;
  const progressPct = total > 0 ? (done / total) * 100 : 0;

  // Auto-collapse a section once every row in it is checked (unless the user has
  // manually toggled that section).
  useEffect(() => {
    setCollapsed((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const g of groups) {
        if (
          g.total > 0 &&
          g.checkedCount === g.total &&
          next[g.id] === undefined &&
          !manuallyToggled.current.has(g.id)
        ) {
          next[g.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);

  // Celebrate the moment the whole list is done.
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      playBeep();
      vibrate([15, 60, 15, 60, 30]);
      setCelebrating(true);
      if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
      celebrateTimer.current = setTimeout(() => setCelebrating(false), 2600);
    }
    prevAllDone.current = allDone;
  }, [allDone]);

  useEffect(() => () => {
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
  }, []);

  const handleToggleRow = useCallback(
    (row: ViewRow) => {
      const next = !row.checked;
      if (row.ids.length === 1) toggleItem(row.ids[0]);
      else setItemsChecked(row.ids, next);
      if (next) vibrate(10);
      refresh();
      notifyListChanged();
    },
    [refresh]
  );

  const handleSetSort = useCallback((mode: SortMode) => {
    setSortMode(mode);
    setSortModeState(mode);
    setCollapsed({});
    manuallyToggled.current = new Set();
  }, []);

  const toggleSection = useCallback((id: string) => {
    manuallyToggled.current.add(id);
    setCollapsed((c) => ({ ...c, [id]: !(c[id] ?? false) }));
  }, []);

  function groupLabel(group: ViewGroup): { emoji: string | null; title: string } {
    if (group.kind === "category") {
      const meta = CATEGORY_BY_ID[group.id as CategoryId];
      return { emoji: meta?.emoji ?? null, title: meta ? tCat(meta.labelKey) : group.id };
    }
    return { emoji: null, title: group.id };
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">
      {/* Header — paddingTop adds the iOS status-bar inset (env(safe-area-inset-top))
          on top of the regular 16px. With viewport-fit=cover + a translucent status
          bar, this full-screen header would otherwise render under the notch /
          Dynamic Island, leaving the back link untappable. */}
      <header
        className="flex items-center justify-between gap-3 px-6 pb-4 border-b border-stone shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
      >
        <Link
          href="/shopping-list"
          className="h-12 flex items-center text-sm text-ink-tertiary hover:text-ink-primary transition-colors shrink-0"
        >
          ← {t("backToList")}
        </Link>

        <div
          className="inline-flex rounded-lg border border-stone overflow-hidden shrink-0"
          role="group"
          aria-label={t("title")}
        >
          {(["recipe", "type"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleSetSort(mode)}
              aria-pressed={sortMode === mode}
              className={`px-3 py-1.5 text-sm transition-colors ${
                sortMode === mode
                  ? "bg-forest text-white"
                  : "bg-white text-ink-secondary hover:bg-surface-hover"
              }`}
            >
              {mode === "recipe" ? t("sortByRecipe") : t("sortByType")}
            </button>
          ))}
        </div>
      </header>

      {/* Progress */}
      <div
        className="h-1.5 bg-stone shrink-0"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className="h-full bg-forest transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {total > 0 && (
        <p className="text-center text-xs text-ink-tertiary py-2 shrink-0 tabular-nums">
          {t("doneCount", { done, total })}
        </p>
      )}

      {/* Body */}
      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-ink-tertiary">{t("emptyTitle")}</p>
          <Link href="/shopping-list" className="btn-ghost">
            {t("backToList")}
          </Link>
        </div>
      ) : (
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 max-w-[640px] mx-auto w-full flex flex-col gap-3">
          {displayGroups.map((group) => {
            const { emoji, title } = groupLabel(group);
            const isCollapsed = collapsed[group.id] ?? false;
            const complete = group.total > 0 && group.checkedCount === group.total;
            return (
              <section key={`${group.kind}:${group.id}`} className="rounded-lg bg-white border border-stone overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(group.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? t("expandSection") : t("collapseSection")}
                  className="w-full h-12 px-4 flex items-center gap-2 text-left hover:bg-surface-hover transition-colors"
                >
                  {emoji && <span aria-hidden="true">{emoji}</span>}
                  <span className={`font-serif font-medium ${complete ? "text-ink-tertiary" : "text-ink-primary"}`}>
                    {title}
                  </span>
                  <span className="ml-auto text-xs text-ink-tertiary tabular-nums">
                    {group.checkedCount}/{group.total}
                  </span>
                  <span className="text-ink-tertiary text-sm w-4 text-center">{isCollapsed ? "▼" : "▲"}</span>
                </button>

                {!isCollapsed && (
                  <ul className="px-2 pb-2">
                    {group.rows.map((row) => (
                      <ShopRow
                        key={row.key}
                        row={row}
                        reduceMotion={reduceMotion}
                        fromSourcesLabel={
                          row.sourceCount > 1 ? t("fromSources", { count: row.sourceCount }) : null
                        }
                        onToggle={handleToggleRow}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </main>
      )}

      {/* "All done" celebration */}
      {celebrating && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-28 flex justify-center z-50 px-6 pointer-events-none"
        >
          <div
            className={`bg-forest text-white px-6 py-3 rounded-xl shadow-lg text-lg font-medium ${
              reduceMotion ? "" : "shopping-celebrate"
            }`}
          >
            {t("allDone")} 🎉
          </div>
        </div>
      )}
    </div>
  );
}
