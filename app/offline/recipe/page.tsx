"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Recipe } from "@/types/recipe";
import { getCachedRecipe } from "@/lib/offline-recipes";
import OfflineRecipeView from "@/components/OfflineRecipeView";

function OfflineRecipeContent() {
  const id = useSearchParams().get("id");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const r = id ? await getCachedRecipe(id) : null;
      if (active) {
        setRecipe(r);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-surface-primary">
      <div className="max-w-[720px] mx-auto px-4 sm:px-8 py-10">
        <a
          href="/offline"
          className="inline-block text-sm text-ink-tertiary hover:text-ink-primary transition-colors mb-8"
        >
          ← Offline-Übersicht
        </a>

        {loading ? (
          <p className="text-sm text-ink-tertiary py-8 text-center">Wird geladen …</p>
        ) : recipe ? (
          <OfflineRecipeView recipe={recipe} />
        ) : (
          <p className="text-sm text-ink-tertiary py-8 text-center">
            Dieses Rezept ist offline nicht verfügbar. Öffne es einmal mit Verbindung,
            damit es hier gespeichert wird.
          </p>
        )}
      </div>
    </div>
  );
}

export default function OfflineRecipePage() {
  return (
    <Suspense fallback={null}>
      <OfflineRecipeContent />
    </Suspense>
  );
}
