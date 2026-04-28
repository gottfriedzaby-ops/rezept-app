"use client";

import { usePathname, useRouter } from "next/navigation";
import { useImport } from "@/contexts/ImportContext";

export default function ImportStatusPill() {
  const { phase } = useImport();
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/" || (phase !== "loading" && phase !== "review")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 bg-white rounded-xl shadow-lg border border-stone text-sm">
      {phase === "loading" && (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-forest border-t-transparent animate-spin" />
          <span className="text-ink-secondary">Rezept wird importiert…</span>
        </>
      )}
      {phase === "review" && (
        <>
          <span className="text-forest font-medium">✓</span>
          <button
            onClick={() => router.push("/")}
            className="text-ink-primary font-medium hover:text-forest transition-colors"
          >
            Import bereit — Jetzt prüfen →
          </button>
        </>
      )}
    </div>
  );
}
