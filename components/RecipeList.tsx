"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useTransition } from "react";
import { useTranslations } from 'next-intl';
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
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
  /**
   * Server mode (main library): `recipes` is the current first page filtered
   * by the URL params (the page is force-dynamic, so every param change
   * re-renders it server-side); "load more" appends further pages via
   * /api/recipes/search. Off for the share pages, which pass complete lists.
   */
  serverSearch?: boolean;
  /** Server mode: globally ranked tag list for the filter bar. */
  allTags?: string[];
  /** Server mode: total number of matching recipes. */
  initialTotal?: number;
}

export default function RecipeList({
  recipes,
  readOnly = false,
  shareToken,
  sharedCollectionOwnerId,
  sharedRecipes,
  serverSearch = false,
  allTags,
  initialTotal,
}: Props) {
  const t = useTranslations('RecipeList');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const query = searchParams.get("q") ?? "";

  const [inputValue, setInputValue] = useState<string>(() => searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountRef = useRef(true);

  useEffect(() => {
    if (isMountRef.current) { isMountRef.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(inputValue), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [inputValue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    setInputValue((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [searchParams]);

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
      // In server mode the navigation re-renders the page server-side with
      // the new filters; the transition gives us a pending indicator.
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
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

  const hasActiveFilter = inputValue !== "" || activeTags.size > 0 || showFavoritesOnly;

  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(recipes.filter((r) => r.favorite).map((r) => r.id))
  );

  // ── Server mode: pages appended via /api/recipes/search ──────────────────
  const [extraItems, setExtraItems] = useState<RecipeEntry[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  // Reset appended pages when the server delivered a fresh first page for
  // changed filters (render-time derived-state reset).
  const filterSignature = [
    query,
    Array.from(activeTags).sort().join(","),
    showFavoritesOnly ? "1" : "0",
    sort,
  ].join("|");
  const lastSignatureRef = useRef(filterSignature);
  if (serverSearch && lastSignatureRef.current !== filterSignature) {
    lastSignatureRef.current = filterSignature;
    if (extraItems.length > 0) setExtraItems([]);
    if (loadMoreError) setLoadMoreError(false);
  }

  // Server re-renders deliver fresh favorite flags — resync the local set.
  useEffect(() => {
    if (!serverSearch) return;
    setFavoriteIds(new Set(recipes.filter((r) => r.favorite).map((r) => r.id)));
  }, [serverSearch, recipes]);

  const loadedCount = recipes.length + extraItems.length;
  const total = serverSearch ? initialTotal ?? recipes.length : recipes.length;

  async function loadMore() {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadMoreError(false);
    try {
      const p = new URLSearchParams();
      if (query) p.set("q", query);
      activeTags.forEach((tag) => p.append("tag", tag));
      if (showFavoritesOnly) p.set("fav", "1");
      if (sort !== "newest") p.set("sort", sort);
      p.set("offset", String(loadedCount));
      const res = await fetch(`/api/recipes/search?${p.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error || !json.data) throw new Error(json.error ?? "load failed");
      const fetched = json.data.recipes as RecipeEntry[];
      setExtraItems((prev) => [...prev, ...fetched]);
      setFavoriteIds((prev) => {
        const s = new Set(prev);
        fetched.forEach((r) => {
          if (r.favorite) s.add(r.id);
        });
        return s;
      });
    } catch {
      setLoadMoreError(true);
    } finally {
      setIsLoadingMore(false);
    }
  }

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
    () =>
      serverSearch
        ? [...(recipes as RecipeEntry[]), ...extraItems]
        : [...recipes, ...(sharedRecipes ?? [])],
    [serverSearch, recipes, extraItems, sharedRecipes]
  );

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
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
  }, [allRecipes, inputValue, activeTags, showFavoritesOnly, favoriteIds, sort]);

  // Tags shown in the filter bar, ranked: active tags first, then by usage
  // count desc (alphabetical tiebreaker). In client mode counts come from the
  // currently filtered set; in server mode the globally ranked list from the
  // server is used (the loaded page is only a subset).
  const availableTags = useMemo(() => {
    if (serverSearch) {
      const base = allTags ?? [];
      const active = Array.from(activeTags);
      return [
        ...active.filter((tag) => base.includes(tag)),
        ...active.filter((tag) => !base.includes(tag)),
        ...base.filter((tag) => !activeTags.has(tag)),
      ];
    }
    const counts = new Map<string, number>();
    filtered.forEach((r) =>
      r.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1))
    );
    activeTags.forEach((t) => {
      if (!counts.has(t)) counts.set(t, 0);
    });
    return Array.from(counts.entries())
      .sort(([a, ca], [b, cb]) => {
        const aActive = activeTags.has(a) ? 1 : 0;
        const bActive = activeTags.has(b) ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;
        if (cb !== ca) return cb - ca;
        return a.localeCompare(b, "de");
      })
      .map(([t]) => t);
  }, [serverSearch, allTags, filtered, activeTags]);

  const [tagsExpanded, setTagsExpanded] = useState(false);
  const COLLAPSED_TAG_COUNT = 12;
  const visibleTags = tagsExpanded
    ? availableTags
    : availableTags.slice(0, COLLAPSED_TAG_COUNT);
  const hiddenTagCount = availableTags.length - visibleTags.length;

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
            aria-label={t('searchAriaLabel')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="input-field pl-9"
          />
        </div>
        <select
          aria-label={t('sortAriaLabel')}
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "az" | "time")}
          className="input-field w-auto"
        >
          <option value="newest">{t('sortNewest')}</option>
          <option value="az">{t('sortAZ')}</option>
          <option value="time">{t('sortTime')}</option>
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
            {t('favorites')}
          </button>
        )}

        {visibleTags.map((tag) => {
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

        {hiddenTagCount > 0 && (
          <button
            type="button"
            onClick={() => setTagsExpanded(true)}
            className="text-xs px-3 py-1 rounded border border-dashed border-ink-tertiary text-ink-secondary hover:text-ink-primary hover:border-ink-secondary transition-colors"
          >
            {t('showMore', { count: hiddenTagCount })}
          </button>
        )}
        {tagsExpanded && availableTags.length > COLLAPSED_TAG_COUNT && (
          <button
            type="button"
            onClick={() => setTagsExpanded(false)}
            className="text-xs px-3 py-1 rounded border border-dashed border-ink-tertiary text-ink-secondary hover:text-ink-primary hover:border-ink-secondary transition-colors"
          >
            {t('showLess')}
          </button>
        )}
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
              {t('noResults')}
            </h3>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 text-sm px-4 py-1.5 rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
            >
              {t('resetFilters')}
            </button>
          </div>
        ) : (
          <p className="text-ink-tertiary text-sm">{t('noRecipes')}</p>
        )
      ) : (
        <ul
          aria-busy={serverSearch && isPending ? true : undefined}
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 ${
            serverSearch && isPending ? "opacity-60 transition-opacity" : ""
          }`}
        >
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
                    title={t('sharedBy', { name: ownerName ?? '' })}
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
                      aria-label={favoriteIds.has(recipe.id) ? t('removeFavorite') : t('addFavorite')}
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
                  className="group flex flex-col h-full border border-stone rounded overflow-hidden bg-white hover:border-ink-tertiary transition-colors"
                >
                  <RecipeCover
                    imageUrl={recipe.image_url}
                    title={recipe.title}
                    tags={recipe.tags}
                    recipeType={recipe.recipe_type}
                    variant="card"
                  />
                  <div className="flex flex-col flex-1 p-4">
                    <h3
                      title={recipe.title}
                      className="font-serif font-medium text-ink-primary text-lg leading-tight tracking-[-0.01em] group-hover:text-forest transition-colors line-clamp-2 min-h-[2.8125rem]"
                    >
                      {recipe.title}
                    </h3>
                    <div
                      aria-hidden={recipe.tags.length === 0 || undefined}
                      className="flex flex-wrap gap-1.5 mt-2.5 min-h-[1.25rem]"
                    >
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
                    <div className="flex-1" aria-hidden="true" />
                    <p
                      aria-hidden={totalTime > 0 || recipe.servings ? undefined : true}
                      className="text-xs text-ink-tertiary mt-3 min-h-[1rem]"
                    >
                      {[
                        totalTime > 0 ? t('totalTime', { time: totalTime }) : null,
                        recipe.servings ? t('portionen', { count: recipe.servings }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Server mode: pagination */}
      {serverSearch && loadedCount < total && (
        <div className="flex flex-col items-center gap-2 mt-10">
          {loadMoreError && (
            <p className="text-sm text-red-600" role="alert">
              {t('loadError')}
            </p>
          )}
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="btn-ghost"
          >
            {isLoadingMore
              ? t('loading')
              : t('loadMore', { remaining: total - loadedCount })}
          </button>
        </div>
      )}
    </div>
  );
}
