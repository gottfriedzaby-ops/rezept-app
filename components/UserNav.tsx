"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUncheckedCount } from "@/lib/shopping-list";

export default function UserNav() {
  const { user, loading } = useAuth();
  const [uncheckedCount, setUncheckedCount] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function syncCount() {
      setUncheckedCount(getUncheckedCount());
    }

    syncCount();

    window.addEventListener("storage", syncCount);
    window.addEventListener("focus", syncCount);

    return () => {
      window.removeEventListener("storage", syncCount);
      window.removeEventListener("focus", syncCount);
    };
  }, []);

  if (loading || !user) return null;

  return (
    <div className="flex items-center gap-3 text-sm text-ink-tertiary">
      <span className="truncate max-w-[180px]" title={user.email ?? undefined}>
        {user.email}
      </span>

      {/* Shopping list link */}
      <Link
        href="/shopping-list"
        aria-label="Einkaufsliste"
        className="relative flex items-center gap-1 hover:text-ink-primary transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        {uncheckedCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium leading-none">
            {uncheckedCount > 9 ? "9+" : uncheckedCount}
          </span>
        )}
      </Link>

      <Link
        href="/settings"
        aria-label="Einstellungen"
        className="flex items-center gap-1 hover:text-ink-primary transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-4 h-4 shrink-0"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10 13a3 3 0 100-6 3 3 0 000 6z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.657 10c0-.34-.02-.674-.057-1.003l1.527-1.19a.375.375 0 00.09-.477l-1.448-2.506a.375.375 0 00-.456-.164l-1.8.723a7.462 7.462 0 00-1.727-.998l-.272-1.912A.375.375 0 0013.146 3h-2.896a.375.375 0 00-.37.313l-.272 1.91a7.464 7.464 0 00-1.727.999l-1.8-.723a.375.375 0 00-.456.164L4.178 8.17a.375.375 0 00.09.476l1.527 1.19A7.596 7.596 0 005.738 10c0 .34.02.674.057 1.003l-1.527 1.19a.375.375 0 00-.09.477l1.448 2.506c.1.173.316.238.456.164l1.8-.723c.535.386 1.116.71 1.727.998l.272 1.912c.05.352.37.473.37.473h2.896s.32-.121.37-.473l.272-1.91a7.464 7.464 0 001.727-.999l1.8.723a.375.375 0 00.456-.164l1.448-2.506a.375.375 0 00-.09-.477l-1.527-1.19c.037-.329.057-.663.057-1.003z"
          />
        </svg>
        Einstellungen
      </Link>
    </div>
  );
}
