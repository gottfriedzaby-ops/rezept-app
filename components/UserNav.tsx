"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getUncheckedCount } from "@/lib/shopping-list";
import type { LibraryShareInbound } from "@/types/library-sharing";

export default function UserNav() {
  const { user, loading } = useAuth();
  const [uncheckedCount, setUncheckedCount] = useState(0);
  const [hasSharedCollections, setHasSharedCollections] = useState(false);
  const [showSharedInMain, setShowSharedInMain] = useState(true);

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

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/library-shares/incoming").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ])
      .then(([sharesJson, settingsJson]) => {
        const accepted = (sharesJson.data ?? []).some(
          (s: LibraryShareInbound) => s.status === "accepted"
        );
        setHasSharedCollections(accepted);
        setShowSharedInMain(settingsJson.data?.show_shared_in_main_library ?? true);
      })
      .catch(() => {});
  }, [user]);

  if (loading || !user) return null;

  return (
    <div className="flex items-center gap-3 text-sm text-ink-tertiary shrink-0">
      <span className="hidden sm:block truncate max-w-[180px]" title={user.email ?? undefined}>
        {user.email}
      </span>

      {/* Shared collections link — only shown when unified view is OFF */}
      {hasSharedCollections && !showSharedInMain && (
        <Link
          href="/library-shares"
          aria-label="Geteilte Sammlungen"
          className="flex items-center gap-1 hover:text-ink-primary transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="w-5 h-5 shrink-0"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
            />
          </svg>
          <span className="hidden sm:inline">Geteilte Sammlungen</span>
        </Link>
      )}

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
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a6.932 6.932 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.281Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
        <span className="hidden sm:inline">Einstellungen</span>
      </Link>
    </div>
  );
}
