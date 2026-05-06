"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Recipe } from "@/types/recipe";
import RecipeCover from "@/components/RecipeCover";
import { getTagColor } from "@/lib/tag-colors";

interface Props {
  recipes: Recipe[];
  readOnly?: boolean;
  shareToken?: string;
  sharedCollectionOwnerId?: string;
  sharedRecipes?: Array<Recipe & { _ownerName: string }>;
  excludeSharedFromTagCloud?: boolean;
}

export default function RecipeList({
  recipes,
  readOnly = false,
  shareToken,
  sharedCollectionOwnerId,
  sharedRecipes,
  excludeSharedFromTagCloud = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(recipes.filter((r) => r.favorite).map((r) => r.id))
  );

  async function toggleFavorite(id: string) {
    const next = !favoriteIds.has(id);
    setFavoriteIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id); else s.delete(id);
      return s;
    });
    try {
      const res = await fetch(`/api/recipes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: next }),
      });
      if (!res.ok) {
        // revert
        setFavoriteIds((prev) => {
          const s = new Set(prev);
          if (next) s.delete(id); else s.add(id);
          return s;
        });
      }
    } catch {
      setFavoriteIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(id); else s.add(id);
        return s;
      });
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      const matchesQuery = q === "" || r.title.toLowerCase().includes(q);
      const matchesTags =
        activeTags.size === 0 || Array.from(activeTags).every((t) => r.tags.includes(t));
      const matchesFavorites = !showFavoritesOnly || favoriteIds.has(r.id);
      return matchesQuery && matchesTags && matchesFavorites;
    });
  }, [recipes, query, activeTags, showFavoritesOnly, favoriteIds]);

  const availableTags = useMemo(() => {
    const seen = new Set<string>(activeTags);
    filtered.forEach((r) => r.tags.forEach((t) => seen.add(t)));
    if (!excludeSharedFromTagCloud && sharedRecipes) {
      sharedRecipes.forEach((r) => r.tags.forEach((t) => seen.add(t)));
    }
    return Array.from(seen).sort();
  }, [filtered, activeTags, sharedRecipes, excludeSharedFromTagCloud]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <div>
      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-tertiary pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen…"
          className="input-field pl-9"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-8">
        {/* Favorites toggle — hidden in read-only mode */}
        {!readOnly && (
          <button
            onClick={() => setShowFavoritesOnly((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded border transition-colors ${
              showFavoritesOnly
                ? "bg-amber-400 text-white border-amber-400"
                : "bg-amber-50 text-amber-600 border-amber-200 hover:opacity-75"
            }`}
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 shrink-0" fill={showFavoritesOnly ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5l1.545 3.13 3.455.5-2.5 2.435.59 3.435L8 10.25l-3.09 1.75.59-3.435L3 6.13l3.455-.5L8 2.5z" />
            </svg>
            Favoriten
          </button>
        )}

        {availableTags.map((tag) => {
            const { bg, text } = getTagColor(tag);
            const active = activeTags.has(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                style={active ? {} : { backgroundColor: bg, color: text, borderColor: bg }}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  active ? "bg-forest text-white border-forest" : "hover:opacity-75"
                }`}
              >
                {tag}
              </button>
            );
          })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Keine Rezepte gefunden.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((recipe) => {
            const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
            const cardHref =
              sharedCollectionOwnerId
                ? `/library-shares/${sharedCollectionOwnerId}/${recipe.id}`
                : readOnly && shareToken
                ? `/shared/${shareToken}/${recipe.id}`
                : `/${recipe.id}`;
            return (
              <li key={recipe.id} className="relative">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleFavorite(recipe.id)}
                    aria-label={favoriteIds.has(recipe.id) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                    className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded bg-white/80 hover:bg-white transition-colors shadow-sm"
                  >
                    <svg viewBox="0 0 16 16" className="w-4 h-4" fill={favoriteIds.has(recipe.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}
                      style={{ color: favoriteIds.has(recipe.id) ? "#FBBF24" : "#A0A09A" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2.5l1.545 3.13 3.455.5-2.5 2.435.59 3.435L8 10.25l-3.09 1.75.59-3.435L3 6.13l3.455-.5L8 2.5z" />
                    </svg>
                  </button>
                )}
                <Link
                  href={cardHref}
                  className="group block border border-stone rounded overflow-hidden bg-white hover:border-ink-tertiary transition-colors"
                >
                  <RecipeCover
                    imageUrl={recipe.image_url}
                    title={recipe.title}
                    tags={recipe.tags}
                    variant="card"
                  />
                  <div className="p-4">
                    <h3 className="font-serif font-medium text-ink-primary text-lg leading-tight tracking-[-0.01em] group-hover:text-forest transition-colors line-clamp-2">
                      {recipe.title}
                    </h3>
                    {recipe.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {recipe.tags.slice(0, 3).map((tag) => {
                          const { bg, text } = getTagColor(tag);
                          return (
                            <span
                              key={tag}
                              style={{ backgroundColor: bg, color: text }}
                              className="text-xs px-2 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {(totalTime > 0 || recipe.servings) && (
                      <p className="text-xs text-ink-tertiary mt-3">
                        {[
                          totalTime > 0 ? `${totalTime} Min.` : null,
                          recipe.servings ? `${recipe.servings} Portionen` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
