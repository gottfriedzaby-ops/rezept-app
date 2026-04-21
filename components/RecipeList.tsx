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
        activeTags.size === 0 || [...activeTags].every((t) => r.tags.includes(t));
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
      <div className="relative mb-4">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rezepte suchen…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeTags.has(tag)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-gray-100 text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">Keine Rezepte gefunden.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {filtered.map((recipe) => (
            <li key={recipe.id} className="py-4">
              <Link href={`/${recipe.id}`} className="group">
                <p className="font-medium group-hover:text-blue-600">{recipe.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[
                    recipe.servings ? `${recipe.servings} Portionen` : null,
                    recipe.prep_time ? `${recipe.prep_time} Min. Vorbereitung` : null,
                    recipe.cook_time ? `${recipe.cook_time} Min. Kochen` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {recipe.tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {recipe.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {recipe.source_title && (
                  <p className="text-xs text-gray-400 mt-1">{recipe.source_title}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
