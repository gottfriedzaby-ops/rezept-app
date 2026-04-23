"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Recipe } from "@/types/recipe";

interface Props {
  recipes: Recipe[];
}

export default function RecipeList({ recipes }: Props) {
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    recipes.forEach((r) => r.tags.forEach((t) => seen.add(t)));
    return Array.from(seen).sort();
  }, [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
      const matchesQuery = q === "" || r.title.toLowerCase().includes(q);
      const matchesTags =
        activeTags.size === 0 || Array.from(activeTags).every((t) => r.tags.includes(t));
      return matchesQuery && matchesTags;
    });
  }, [recipes, query, activeTags]);

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
      <div className="relative mb-6 max-w-sm">
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

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                activeTags.has(tag)
                  ? "bg-forest text-white border-forest"
                  : "bg-transparent text-ink-secondary border-stone hover:bg-surface-hover"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Recipe list */}
      {filtered.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Keine Rezepte gefunden.</p>
      ) : (
        <ul className="divide-y divide-stone">
          {filtered.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/${recipe.id}`}
                className="group flex flex-col gap-1.5 py-5 hover:bg-surface-hover -mx-4 px-4 rounded transition-colors"
              >
                <span className="font-serif text-xl font-medium text-ink-primary tracking-[-0.01em] group-hover:text-forest transition-colors">
                  {recipe.title}
                </span>
                <span className="text-sm text-ink-tertiary">
                  {[
                    recipe.servings ? `${recipe.servings} Portionen` : null,
                    recipe.prep_time ? `${recipe.prep_time} Min. Vorbereitung` : null,
                    recipe.cook_time ? `${recipe.cook_time} Min. Kochen` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {recipe.tags.length > 0 && (
                  <span className="text-xs text-ink-tertiary">
                    {recipe.tags.join(", ")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
