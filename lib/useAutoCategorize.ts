"use client";

import { useEffect, useRef } from "react";
import type { ShoppingListItem, SortMode } from "@/lib/shopping-list";
import {
  categorizeIngredientLocal,
  normalizeIngredientName,
  getLearnedCategories,
  mergeLearnedCategories,
  isCategoryId,
  type CategoryId,
} from "@/lib/ingredient-categories";

/**
 * Hybrid-AI fallback for the "by type" view. When sorting by category, any
 * ingredient that the static keyword map cannot place (and isn't already in the
 * local cache) is sent — once per device — to /api/shopping/categorize. That
 * endpoint resolves names against a SHARED, cross-user table (so a lookup by
 * any user benefits everyone) and only asks Claude for names new to the whole
 * system. Results are merged into the local cache as a per-device fast path.
 *
 * Non-blocking: unknowns show under "Sonstiges" until the response lands, then
 * move to their aisle when `onLearned` refreshes the consumer.
 */
export function useAutoCategorize(
  items: ShoppingListItem[],
  sortMode: SortMode,
  onLearned: (learned: Record<string, CategoryId>) => void
): void {
  // Normalized names we've already sent, so a mid-flight re-render won't re-POST.
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (sortMode !== "type") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const learned = getLearnedCategories();
    const unknown = new Map<string, string>(); // normalized -> original name
    for (const item of items) {
      if (item.manual) continue; // manual entries are always "sonstiges"
      const norm = normalizeIngredientName(item.ingredient_name);
      if (!norm || attempted.current.has(norm) || learned[norm]) continue;
      if (categorizeIngredientLocal(item.ingredient_name) !== null) continue;
      unknown.set(norm, item.ingredient_name);
    }
    if (unknown.size === 0) return;

    unknown.forEach((_value, norm) => attempted.current.add(norm));
    const names = Array.from(unknown.values());
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/shopping/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names }),
        });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const data = json?.data;
        if (!data || typeof data !== "object" || cancelled) return;

        const updates: Record<string, CategoryId> = {};
        for (const [name, id] of Object.entries(data as Record<string, unknown>)) {
          if (isCategoryId(id)) updates[normalizeIngredientName(name)] = id;
        }
        if (Object.keys(updates).length === 0) return;

        const merged = mergeLearnedCategories(updates);
        if (!cancelled) onLearned(merged);
      } catch {
        // Offline / API error → items simply stay under "Sonstiges".
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, sortMode, onLearned]);
}
