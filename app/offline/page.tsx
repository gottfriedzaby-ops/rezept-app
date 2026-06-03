"use client";

import { useEffect, useState } from "react";
import { getList, toggleItem, notifyListChanged, type ShoppingListItem } from "@/lib/shopping-list";
import { getCachedRecipes, type CachedRecipeMeta } from "@/lib/offline-recipes";
import { recipeTypeBadgeFor } from "@/lib/recipeTypeLabels";

// Offline fallback page. The shopping list lives entirely in localStorage, so
// it stays fully usable without a connection — exactly the in-store use case.
// German only (default locale): this is an emergency fallback, not a localised
// route. Uses plain <a> (no next-intl provider in this layout).

function formatItem(item: ShoppingListItem): string {
  const qty = [item.amount ?? "", item.unit].filter(Boolean).join(" ").trim();
  return qty ? `${qty} ${item.ingredient_name}` : item.ingredient_name;
}

export default function OfflinePage() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [recipes, setRecipes] = useState<CachedRecipeMeta[]>([]);

  useEffect(() => {
    setItems(getList());
    getCachedRecipes().then(setRecipes).catch(() => {});
  }, []);

  function handleToggle(id: string) {
    toggleItem(id);
    setItems(getList());
    notifyListChanged();
  }

  // Preserve insertion order while grouping by recipe.
  const groups: { title: string; items: ShoppingListItem[] }[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.title === item.recipe_title);
    if (!group) {
      group = { title: item.recipe_title, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-8 py-10">
        <div className="rounded-lg border border-stone bg-surface-secondary px-5 py-4 mb-8">
          <h1 className="font-serif text-2xl font-medium text-ink-primary tracking-[-0.02em]">
            Du bist offline
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Keine Verbindung. Deine Einkaufsliste und zuletzt geöffnete Rezepte sind hier
            weiterhin verfügbar — abgehakte Artikel werden gespeichert. Sobald du wieder
            online bist, lädt die App automatisch neu.
          </p>
        </div>

        {recipes.length > 0 && (
          <section className="mb-10">
            <h2 className="font-serif text-lg font-medium text-ink-primary mb-3">
              Offline verfügbare Rezepte
            </h2>
            <ul className="space-y-1">
              {recipes.map((r) => (
                <li key={r.id}>
                  <a
                    href={`/offline/recipe?id=${encodeURIComponent(r.id)}`}
                    className="flex items-center gap-3 py-2 px-3 rounded hover:bg-surface-hover transition-colors"
                  >
                    <span className="text-base" aria-hidden="true">
                      {recipeTypeBadgeFor(r.recipe_type).emoji}
                    </span>
                    <span className="flex-1 text-sm text-ink-primary">{r.title}</span>
                    <span className="text-ink-tertiary text-sm" aria-hidden="true">→</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 className="font-serif text-lg font-medium text-ink-primary mb-3">Einkaufsliste</h2>
        {items.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-8 text-center">
            Deine Einkaufsliste ist leer.
          </p>
        ) : (
          <div className="space-y-6 mb-10">
            {groups.map((group) => (
              <div key={group.title}>
                <h2 className="font-serif text-base font-medium text-ink-secondary mb-2">
                  {group.title}
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 py-2 px-3 rounded hover:bg-surface-hover transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleToggle(item.id)}
                        className="w-4 h-4 rounded accent-forest shrink-0 cursor-pointer"
                        aria-label={formatItem(item)}
                      />
                      <span
                        className={`flex-1 text-sm text-ink-primary transition-colors ${
                          item.checked ? "line-through opacity-50" : ""
                        }`}
                      >
                        {formatItem(item)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <a
          href="/"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors"
        >
          ← Zurück zur App
        </a>
      </div>
    </div>
  );
}
