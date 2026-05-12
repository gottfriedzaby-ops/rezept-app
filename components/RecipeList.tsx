"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import type { Recipe } from "@/types/recipe";
import RecipeCover from "@/components/RecipeCover";
import { getTagColor } from "@/lib/tag-colors";

type SharedRecipe = Recipe & { _ownerName: string };
type RecipeEntry = Recipe & { _ownerName?: string };

interface Props {
  recipes: Recipe[];
  readOnly?: boolean;
  shareToken?: string;
  sharedCollectionOwnerId?: string;
  sharedRecipes?: SharedRecipe[];
}

export default function RecipeList({
  recipes,
  readOnly = false,
  shareToken,
  sharedCollectionOwnerId,
  sharedRecipes,
}: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const query = searchParams.get("q") ?? "";
  const activeTags = useMemo(
    () => new Set(searchParams.getAll("tag")),
    [searchParams]
  );
  const showFavoritesOnly = searchParams.get("fav") === "1";
  const sortRaw = searchParams.get("sort") ?? "newest";
  const sort: "newest" | "az" | "time" =
    sortRaw === "az" || sortRaw === "time" ? sortRaw : "newest";

  const updateParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(Array.from(searchParams.entries()));
      mutate(p);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const setQuery = (value: string) => {
    updateParams((p) => {
      p.delete("q");
      if (value) p.set("q", value);
    });
  };

  const setShowFavoritesOnly = (value: boolean) => {
    updateParams((p) => {
      if (value) p.set("fav", "1");
      else p.delete("fav");
    });
  };

  const setSort = (value: "newest" | "az" | "time") => {
    updateParams((p) => {
      if (value === "newest") p.delete("sort");
      else p.set("sort", value);
    });
  };

  const resetFilters = useCallback(() => {
    updateParams((p) => {
      p.delete("q");
      p.delete("tag");
      p.delete("fav");
    });
  }, [updateParams]);

  const hasActiveFilter = query !== "" || activeTags.size > 0 || showFavoritesOnly;

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

  const allRecipes = useMemo<RecipeEntry[]>(
    () => [...recipes, ...(sharedRecipes ?? [])],
    [recipes, sharedRecipes]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = allRecipes.filter((r) => {
      const matchesQuery =
        q === "" ||
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(q));
      const matchesTags =
        activeTags.size === 0 || Array.from(activeTags).every((t) => r.tags.includes(t));
      const matchesFavorites = !showFavoritesOnly || favoriteIds.has(r.id);
      return matchesQuery && matchesTags && matchesFavorites;
    });
    if (sort === "az") {
      result.sort((a, b) => a.title.localeCompare(b.title, "de"));
    } else if (sort === "time") {
      result.sort(
        (a, b) =>
          ((a.prep_time ?? 0) + (a.cook_time ?? 0)) -
          ((b.prep_time ?? 0) + (b.cook_time ?? 0))
      );
    }
    return result;
  }, [allRecipes, query, activeTags, showFavoritesOnly, favoriteIds, sort]);

  const availableTags = useMemo(() => {
    const seen = new Set<string>(activeTags);
    filtered.forEach((r) => r.tags.forEach((t) => seen.add(t)));
    return Array.from(seen).sort();
  }, [filtered, activeTags]);

  function toggleTag(tag: string) {
    updateParams((p) => {
      const current = p.getAll("tag");
      p.delete("tag");
      const next = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag];
      next.forEach((t) => p.append("tag", t));
    });
  }

  return (
    <div>
      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
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
        <select
          aria-label="Sortierung"
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "az" | "time")}
          className="input-field w-auto"
        >
          <option value="newest">Neueste zuerst</option>
          <option value="az">A–Z</option>
          <option value="time">Kochzeit</option>
        </select>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-8">
        {/* Favorites toggle — hidden in read-only mode */}
        {!readOnly && (
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
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
        hasActiveFilter ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <svg
              viewBox="0 0 64 64"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-16 h-16 text-forest mb-5"
              aria-hidden="true"
            >
              <path d="M8 16h20c2 0 4 2 4 4v32c0-2-2-4-4-4H8V16z" />
              <path d="M56 16H36c-2 0-4 2-4 4v32c0-2 2-4 4-4h20V16z" />
              <path d="M14 24h12M14 30h12M14 36h8M38 24h12M38 30h12M38 36h8" />
            </svg>
            <h3 className="font-serif text-xl font-medium text-ink-primary mb-2">
              Nichts gefunden
            </h3>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-sm px-4 py-1.5 rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
            >
              Filter zurücksetzen
            </button>
          </div>
        ) : (
          <p className="text-ink-tertiary text-sm">Keine Rezepte gefunden.</p>
        )
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((recipe) => {
            const isShared = !!(recipe as RecipeEntry)._ownerName;
            const ownerName = (recipe as RecipeEntry)._ownerName;
            const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0);
            const cardHref = isShared
              ? `/library-shares/${recipe.user_id}/${recipe.id}`
              : sharedCollectionOwnerId
              ? `/library-shares/${sharedCollectionOwnerId}/${recipe.id}`
              : readOnly && shareToken
              ? `/shared/${shareToken}/${recipe.id}`
              : `/${recipe.id}`;
            return (
              <li key={recipe.id} className="relative">
                {isShared ? (
                  <div
                    title={`Geteilt von ${ownerName}`}
                    className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded bg-white/85 shadow-sm text-xs text-ink-secondary max-w-[140px]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                    </svg>
                    <span className="truncate">{ownerName}</span>
                  </div>
                ) : (
                  !readOnly && (
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
                  )
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
