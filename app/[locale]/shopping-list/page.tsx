"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getList,
  toggleItem,
  setItemsChecked,
  removeItem,
  clearList,
  addManualItem,
  getHideChecked,
  setHideChecked,
  getUncheckedCount,
  getSortMode,
  setSortMode,
  notifyListChanged,
  type ShoppingListItem,
  type SortMode,
} from "@/lib/shopping-list";
import { buildGroups, formatRowAmount, type ViewGroup, type ViewRow } from "@/lib/shopping-list-view";
import { getLearnedCategories, CATEGORY_BY_ID, type CategoryId } from "@/lib/ingredient-categories";
import { useAutoCategorize } from "@/lib/useAutoCategorize";

export default function ShoppingListPage() {
  const t = useTranslations("ShoppingList");
  const tCat = useTranslations("ShoppingCategories");
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [hideChecked, setHideCheckedState] = useState(false);
  const [sortMode, setSortModeState] = useState<SortMode>("recipe");
  const [learned, setLearned] = useState<Record<string, CategoryId>>({});
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // SSR-safe mount
  useEffect(() => {
    setItems(getList());
    setHideCheckedState(getHideChecked());
    setSortModeState(getSortMode());
    setLearned(getLearnedCategories());
  }, []);

  useAutoCategorize(items, sortMode, setLearned);

  function refresh() {
    setItems(getList());
  }

  function handleToggleRow(row: ViewRow) {
    if (row.ids.length === 1) toggleItem(row.ids[0]);
    else setItemsChecked(row.ids, !row.checked);
    refresh();
    notifyListChanged();
  }

  function handleRemoveRow(row: ViewRow) {
    row.ids.forEach((id) => removeItem(id));
    refresh();
    notifyListChanged();
  }

  function handleClear() {
    clearList();
    setConfirmClearOpen(false);
    refresh();
    notifyListChanged();
  }

  function handleToggleHideChecked() {
    const next = !hideChecked;
    setHideChecked(next);
    setHideCheckedState(next);
  }

  function handleSetSort(mode: SortMode) {
    setSortMode(mode);
    setSortModeState(mode);
  }

  function handleAddManual() {
    const text = manualInput.trim();
    if (!text) return;
    addManualItem(text);
    setManualInput("");
    refresh();
    notifyListChanged();
    inputRef.current?.focus();
  }

  const displayItems = hideChecked ? items.filter((i) => !i.checked) : items;
  const groups = buildGroups(displayItems, sortMode, learned);
  const uncheckedCount = getUncheckedCount();
  const totalCount = items.length;

  function groupHeading(group: ViewGroup): string {
    if (group.kind === "category") {
      const meta = CATEGORY_BY_ID[group.id as CategoryId];
      return meta ? `${meta.emoji} ${tCat(meta.labelKey)}` : group.id;
    }
    return group.id;
  }

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← {t("backToRecipes")}
        </Link>

        {/* Header row */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-[2rem] font-medium text-ink-primary tracking-[-0.02em]">
              {t("title")}
            </h1>
            {uncheckedCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-ink-secondary border border-stone">
                {t("unchecked", { count: uncheckedCount })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort toggle */}
            {totalCount > 0 && (
              <div
                className="inline-flex rounded border border-stone overflow-hidden"
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
                        : "text-ink-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {mode === "recipe" ? t("sortByRecipe") : t("sortByType")}
                  </button>
                ))}
              </div>
            )}

            {items.some((i) => i.checked) && (
              <button
                type="button"
                onClick={handleToggleHideChecked}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
              >
                {hideChecked ? (
                  <>
                    <svg
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
                        d="M3.98 8.223A10.477 10.477 0 001.934 10C3.226 13.307 6.368 15.6 10 15.6c.9 0 1.765-.12 2.586-.34M6.228 6.228A3 3 0 0113.772 13.772M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L18 18m-3.228-3.228l-3.65-3.65m0 0a3 3 0 01-4.243-4.243m4.242 4.243L9.88 9.88"
                      />
                    </svg>
                    {t("showChecked")}
                  </>
                ) : (
                  <>
                    <svg
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
                        d="M3.98 8.223A10.477 10.477 0 001.934 10C3.226 13.307 6.368 15.6 10 15.6c.9 0 1.765-.12 2.586-.34M6.228 6.228A3 3 0 0113.772 13.772m-7.544 0L3 17m3.228-3.228 3.65 3.65M9.88 9.88l4.11 4.11M17.657 10C16.364 6.693 13.223 4.4 9.59 4.4c-.9 0-1.764.12-2.586.34"
                      />
                    </svg>
                    {t("hideChecked")}
                  </>
                )}
              </button>
            )}

            {totalCount > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  {/* Lid handle */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 5h4V3.5a.5.5 0 00-.5-.5h-3a.5.5 0 00-.5.5V5z" />
                  {/* Lid bar */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 5h13" />
                  {/* Bin body */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5l1 11.5a.5.5 0 00.5.5h7a.5.5 0 00.5-.5L15 5" />
                  {/* Vertical lines inside bin */}
                  <line strokeLinecap="round" x1="8" y1="8.5" x2="8" y2="14.5" />
                  <line strokeLinecap="round" x1="10" y1="8.5" x2="10" y2="14.5" />
                  <line strokeLinecap="round" x1="12" y1="8.5" x2="12" y2="14.5" />
                </svg>
                {t("clearAll")}
              </button>
            )}
          </div>
        </div>

        {/* Start shopping mode */}
        {totalCount > 0 && (
          <Link
            href="/shopping-list/shop"
            className="btn-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto mb-8"
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {t("startShoppingMode")}
          </Link>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <p className="text-sm text-ink-tertiary py-8 text-center">
            {t("emptyTitle")} {t("emptyHint")}
          </p>
        )}

        {/* Grouped items */}
        {groups.length > 0 && (
          <div className="space-y-6 mb-10">
            {groups.map((group) => (
              <div key={`${group.kind}:${group.id}`}>
                <h2 className="font-serif text-base font-medium text-ink-secondary mb-2">
                  {groupHeading(group)}
                </h2>
                <ul className="space-y-1">
                  {group.rows.map((row) => (
                    <li
                      key={row.key}
                      className="flex items-center gap-3 py-2 px-3 rounded hover:bg-surface-hover group transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={() => handleToggleRow(row)}
                        className="w-4 h-4 rounded accent-forest shrink-0 cursor-pointer"
                        aria-label={formatRowAmount(row.amount, row.unit, row.displayName)}
                      />
                      <span
                        className={`flex-1 text-sm text-ink-primary transition-colors ${
                          row.checked ? "line-through opacity-50" : ""
                        }`}
                      >
                        {formatRowAmount(row.amount, row.unit, row.displayName)}
                        {row.sourceCount > 1 && (
                          <span className="ml-2 text-xs text-ink-tertiary">
                            {t("fromSources", { count: row.sourceCount })}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row)}
                        aria-label={t("removeItem")}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-ink-tertiary hover:text-ink-primary hover:bg-surface-secondary transition-all shrink-0 text-base leading-none"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* Manual entry */}
        <div className="border-t border-stone pt-6">
          <label
            htmlFor="manual-input"
            className="block text-sm font-medium text-ink-secondary mb-2"
          >
            {t("addItemLabel")}
          </label>
          <div className="flex gap-2">
            <input
              id="manual-input"
              ref={inputRef}
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddManual();
              }}
              placeholder={t("addItemPlaceholder")}
              className="flex-1 px-4 py-2.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors"
            />
            <button
              type="button"
              onClick={handleAddManual}
              disabled={!manualInput.trim()}
              className="btn-primary"
            >
              {t("addItem")}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title={t("confirmClearTitle")}
        message={t("confirmClearMessage", { count: totalCount })}
        confirmLabel={t("clearAll")}
        destructive
        onConfirm={handleClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
