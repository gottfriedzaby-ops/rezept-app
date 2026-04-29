"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Recipe, Step } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { ctaLabelFor } from "@/lib/recipeTypeLabels";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function formatAmount(perServing: number, servings: number): string {
  const total = perServing * servings;
  if (total <= 0) return "";
  const r = Math.round(total * 10) / 10;
  return r % 1 === 0 ? String(Math.round(r)) : r.toFixed(1);
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch {
    // Web Audio not available
  }
}

interface CookStep {
  step: Step;
  sectionTitle: string | null;
}

interface Props {
  recipe: Recipe;
  initialServings: number;
}

export default function CookMode({ recipe, initialServings }: Props) {
  const sections = getRecipeSections(recipe);
  const multiSection = sections.length > 1 || sections[0]?.title !== null;

  // Flatten all steps across sections, keeping track of which section each belongs to
  const cookSteps: CookStep[] = sections.flatMap((section) =>
    section.steps.map((step) => ({ step, sectionTitle: section.title }))
  );

  // Flat ingredient list across all sections for the accordion
  const allIngredients = sections.flatMap((s) => s.ingredients);

  const [stepIndex, setStepIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(cookSteps[0]?.step.timerSeconds ?? null);
  const [timerRunning, setTimerRunning] = useState(false);

  const currentCookStep = cookSteps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === cookSteps.length - 1;

  // Wake Lock
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sentinel: any = null;
    let mounted = true;

    const acquire = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        if ("wakeLock" in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lock = await (navigator as any).wakeLock.request("screen");
          if (!mounted) { lock.release().catch(() => {}); return; }
          sentinel = lock;
        }
      } catch { /* not supported or denied */ }
    };

    acquire();
    const onVisChange = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisChange);
      sentinel?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    setTimerRunning(false);
    setTimeLeft(cookSteps[stepIndex]?.step.timerSeconds ?? null);
  }, [stepIndex, cookSteps]);

  useEffect(() => {
    if (!timerRunning || timeLeft === null || timeLeft <= 0) return;
    const id = setTimeout(() => {
      const next = timeLeft - 1;
      setTimeLeft(next);
      if (next === 0) { setTimerRunning(false); playBeep(); }
    }, 1000);
    return () => clearTimeout(id);
  }, [timerRunning, timeLeft]);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimeLeft(currentCookStep?.step.timerSeconds ?? null);
  }, [currentCookStep]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone shrink-0">
        <Link
          href={`/${recipe.id}`}
          className="h-12 flex items-center text-sm text-ink-tertiary hover:text-ink-primary transition-colors"
        >
          ← Beenden
        </Link>
        <div className="text-center">
          <p className="text-xs text-ink-tertiary uppercase tracking-widest mb-0.5 hidden sm:block truncate max-w-[240px]">
            {recipe.title}
          </p>
          <p className="text-lg font-medium text-ink-primary tabular-nums">
            {stepIndex + 1} / {cookSteps.length}
          </p>
        </div>
        <div className="w-20" />
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto px-6 py-10 max-w-[720px] mx-auto w-full flex flex-col gap-8">
        {/* Section label — shown above step text for multi-section recipes */}
        {multiSection && currentCookStep.sectionTitle && (
          <p className="label-overline text-forest">{currentCookStep.sectionTitle}</p>
        )}

        <p
          className="font-serif font-medium text-ink-primary leading-relaxed"
          style={{ fontSize: "clamp(1.4rem, 4vw, 1.875rem)" }}
        >
          {currentCookStep.step.text}
        </p>

        {/* Timer */}
        {timeLeft !== null && (
          <div className="flex flex-col gap-5">
            <span
              className={`font-mono font-medium tabular-nums ${
                timeLeft === 0 ? "text-forest" : "text-ink-primary"
              }`}
              style={{ fontSize: "clamp(3rem, 10vw, 5rem)" }}
            >
              {timeLeft === 0 ? "Fertig ✓" : formatTime(timeLeft)}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setTimerRunning((r) => !r)}
                disabled={timeLeft === 0}
                className="h-14 px-8 rounded bg-forest text-white font-medium hover:bg-forest-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-w-[120px]"
              >
                {timerRunning ? "Pause" : "Start"}
              </button>
              <button
                onClick={resetTimer}
                className="h-14 px-8 rounded border border-stone text-ink-secondary font-medium hover:bg-surface-hover transition-colors min-w-[100px]"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Ingredients accordion */}
      <div className="border-t border-stone shrink-0">
        <button
          onClick={() => setShowIngredients((s) => !s)}
          className="w-full h-14 px-6 flex items-center justify-between text-ink-secondary hover:bg-surface-hover transition-colors"
        >
          <span className="text-sm font-medium">
            Zutaten für {initialServings} Portion{initialServings !== 1 ? "en" : ""}
          </span>
          <span className="text-ink-tertiary text-sm">{showIngredients ? "▲" : "▼"}</span>
        </button>

        {showIngredients && (
          <div className="px-6 pb-5 bg-surface-secondary border-t border-stone">
            {multiSection
              ? sections.map((section, sIdx) => (
                  <div key={sIdx}>
                    {section.title && (
                      <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wider pt-4 pb-2">
                        {section.title}
                      </p>
                    )}
                    <ul className="space-y-3">
                      {section.ingredients.map((ing, i) => (
                        <li key={i} className="flex gap-4 text-sm pt-1">
                          {ing.amount > 0 && (
                            <span className="font-medium text-ink-primary tabular-nums w-20 shrink-0">
                              {formatAmount(ing.amount, initialServings)}
                              {ing.unit ? ` ${ing.unit}` : ""}
                            </span>
                          )}
                          <span className="text-ink-secondary">{ing.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              : (
                <ul className="space-y-3">
                  {allIngredients.map((ing, i) => (
                    <li key={i} className="flex gap-4 text-sm pt-3">
                      {ing.amount > 0 && (
                        <span className="font-medium text-ink-primary tabular-nums w-20 shrink-0">
                          {formatAmount(ing.amount, initialServings)}
                          {ing.unit ? ` ${ing.unit}` : ""}
                        </span>
                      )}
                      <span className="text-ink-secondary">{ing.name}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex gap-3 p-4 border-t border-stone shrink-0">
        <button
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="flex-1 h-14 rounded border border-stone text-ink-secondary font-medium hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Zurück
        </button>

        {isLast ? (
          <Link
            href={`/${recipe.id}`}
            className="flex-1 h-14 rounded bg-forest text-white font-medium hover:bg-forest-deep transition-colors flex items-center justify-center"
          >
            Fertig!
          </Link>
        ) : (
          <button
            onClick={() => setStepIndex((i) => i + 1)}
            className="flex-1 h-14 rounded bg-ink-primary text-white font-medium hover:bg-ink-secondary transition-colors"
          >
            Weiter →
          </button>
        )}
      </nav>
    </div>
  );
}
