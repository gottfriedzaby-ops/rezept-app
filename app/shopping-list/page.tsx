"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getList,
  toggleItem,
  removeItem,
  clearList,
  addManualItem,
  getHideChecked,
  setHideChecked,
  getUncheckedCount,
  type ShoppingListItem,
} from "@/lib/shopping-list";

interface GroupedItems {
  recipeTitle: string;
  items: ShoppingListItem[];
}

function groupByRecipe(items: ShoppingListItem[]): GroupedItems[] {
  const order: string[] = [];
  const map: Record<string, ShoppingListItem[]> = {};
  for (const item of items) {
    if (!map[item.recipe_title]) {
      order.push(item.recipe_title);
      map[item.recipe_title] = [];
    }
    map[item.recipe_title].push(item);
  }
  return order.map((title) => ({ recipeTitle: title, items: map[title] }));
}

function formatAmount(item: ShoppingListItem): string {
  const parts: string[] = [];
  if (item.amount != null) parts.push(String(item.amount));
  if (item.unit) parts.push(item.unit);
  parts.push(item.ingredient_name);
  return parts.join(" ");
}

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [hideChecked, setHideCheckedState] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // SSR-safe mount
  useEffect(() => {
    setItems(getList());
    setHideCheckedState(getHideChecked());
  }, []);

  function refresh() {
    setItems(getList());
  }

  function handleToggle(id: string) {
    toggleItem(id);
    refresh();
  }

  function handleRemove(id: string) {
    removeItem(id);
    refresh();
  }

  function handleClear() {
    clearList();
    setConfirmClearOpen(false);
    refresh();
  }

  function handleToggleHideChecked() {
    const next = !hideChecked;
    setHideChecked(next);
    setHideCheckedState(next);
  }

  function handleAddManual() {
    const text = manualInput.trim();
    if (!text) return;
    addManualItem(text);
    setManualInput("");
    refresh();
    inputRef.current?.focus();
  }

  const displayItems = hideChecked ? items.filter((i) => !i.checked) : items;
  const groups = groupByRecipe(displayItems);
  const uncheckedCount = getUncheckedCount();
  const totalCount = items.length;

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-10"
        >
          ← Zurück
        </Link>

        {/* Header row */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-[2rem] font-medium text-ink-primary tracking-[-0.02em]">
              Einkaufsliste
            </h1>
            {uncheckedCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-ink-secondary border border-stone">
                {uncheckedCount} offen
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
                    Erledigte einblenden
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
                    Erledigte ausblenden
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 4.5V4a1 1 0 011-1h2a1 1 0 011 1v.5" />
                  {/* Lid */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6.5h14" />
                  {/* Bin body */}
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 6.5l.9 9.5a1 1 0 001 .9h6.2a1 1 0 001-.9l.9-9.5" />
                  {/* Vertical lines inside bin */}
                  <path strokeLinecap="round" d="M8 9v5M10 9v5M12 9v5" />
                </svg>
                Liste leeren
              </button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <p className="text-sm text-ink-tertiary py-8 text-center">
            Deine Einkaufsliste ist leer. Füge Zutaten über eine Rezeptdetailseite hinzu.
          </p>
        )}

        {/* Grouped items */}
        {groups.length > 0 && (
          <div className="space-y-6 mb-10">
            {groups.map((group) => (
              <div key={group.recipeTitle}>
                <h2 className="font-serif text-base font-medium text-ink-secondary mb-2">
                  {group.recipeTitle}
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 py-2 px-3 rounded hover:bg-surface-hover group transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleToggle(item.id)}
                        className="w-4 h-4 rounded accent-forest shrink-0 cursor-pointer"
                        aria-label={`${formatAmount(item)} abhaken`}
                      />
                      <span
                        className={`flex-1 text-sm text-ink-primary transition-colors ${
                          item.checked ? "line-through opacity-50" : ""
                        }`}
                      >
                        {formatAmount(item)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        aria-label="Zutat entfernen"
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
            Artikel hinzufügen
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
              placeholder="z.B. Kaffee"
              className="flex-1 px-4 py-2.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors"
            />
            <button
              type="button"
              onClick={handleAddManual}
              disabled={!manualInput.trim()}
              className="btn-primary"
            >
              Hinzufügen
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Liste leeren"
        message={`Alle ${totalCount} Einträge löschen?`}
        confirmLabel="Alles löschen"
        destructive
        onConfirm={handleClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
