"use client";

import { useEffect } from "react";
import type { Recipe } from "@/types/recipe";
import { cacheRecipe } from "@/lib/offline-recipes";

// Rendered (invisibly) on the recipe detail page. When a recipe is viewed
// online, its data is persisted to IndexedDB so it can be read offline, and the
// direct image URLs are fetched once to warm the service-worker image cache
// (the offline view loads them by their direct URL). All best-effort.
export default function OfflineRecipeCacher({ recipe }: { recipe: Recipe }) {
  useEffect(() => {
    cacheRecipe(recipe);

    const urls = [recipe.image_url, ...(recipe.step_images ?? [])].filter(
      (u): u is string => Boolean(u),
    );
    for (const url of urls) {
      // The service worker (CacheFirst) serves repeats from cache, so this only
      // hits the network the first time a recipe is viewed.
      fetch(url).catch(() => {});
    }
  }, [recipe]);

  return null;
}
