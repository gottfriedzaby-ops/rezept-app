"use client";

import { useEffect } from "react";
import {
  addShoppingListMutationListener,
  getRawList,
  notifyListChanged,
  replaceList,
  type ShoppingListItem,
} from "@/lib/shopping-list";

// Cloud sync for the shopping list. localStorage stays the offline source of
// truth; this layer pushes local changes (including deletion tombstones) to
// /api/shopping-list/sync and stores the merged server state back. Failures
// are silent — the list keeps working locally and the next sync catches up.

const SYNC_DEBOUNCE_MS = 2000;

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;
let queued = false;

function normalizeForSync(items: ShoppingListItem[]): ShoppingListItem[] {
  // Items stored before the sync rollout have no updated_at.
  return items.map((item) =>
    item.updated_at ? item : { ...item, updated_at: item.added_at }
  );
}

export async function syncShoppingList(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (syncing) {
    queued = true;
    return false;
  }
  syncing = true;
  try {
    const items = normalizeForSync(getRawList());
    const res = await fetch("/api/shopping-list/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) return false;
    const json = await res.json().catch(() => null);
    if (!json?.data?.items) return false;
    replaceList(json.data.items as ShoppingListItem[]);
    notifyListChanged();
    return true;
  } catch {
    return false; // offline or server unreachable — keep local state
  } finally {
    syncing = false;
    if (queued) {
      queued = false;
      scheduleShoppingListSync();
    }
  }
}

export function scheduleShoppingListSync(delayMs = SYNC_DEBOUNCE_MS): void {
  if (typeof window === "undefined") return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncShoppingList();
  }, delayMs);
}

/**
 * Mount-level integration: pulls + merges on mount, re-syncs when the device
 * comes back online, and pushes (debounced) after every local mutation.
 * Mounted in UserNav, so any page with the nav keeps the list in sync.
 */
export function useShoppingListSync(): void {
  useEffect(() => {
    const removeListener = addShoppingListMutationListener(() =>
      scheduleShoppingListSync()
    );
    void syncShoppingList();

    const onOnline = () => void syncShoppingList();
    window.addEventListener("online", onOnline);

    return () => {
      removeListener();
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
