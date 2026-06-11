"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "rezept-app:theme";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(preference: ThemePreference): void {
  const dark =
    preference === "dark" || (preference === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle() {
  const t = useTranslations("Settings");
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") setPreference(stored);
    } catch {
      // localStorage unavailable — stay on system
    }
  }, []);

  function select(next: ThemePreference): void {
    setPreference(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore — the class still applies for this session
    }
    applyTheme(next);
  }

  const options: Array<{ value: ThemePreference; label: string }> = [
    { value: "system", label: t("themeSystem") },
    { value: "light", label: t("themeLight") },
    { value: "dark", label: t("themeDark") },
  ];

  return (
    <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t("appearance")}>
      {options.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => select(value)}
          className={`px-4 py-2 text-sm rounded border transition-colors ${
            preference === value
              ? "bg-ink-primary text-surface-primary border-ink-primary"
              : "bg-surface-card text-ink-secondary border-stone hover:bg-surface-hover"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
