"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Recipe, Step, Ingredient } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";
import { formatScaledAmount as formatAmount, resolveStepText } from "@/lib/stepText";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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
  ingredients: Ingredient[];
}

interface IngredientRowProps {
  ing: { amount: number; unit: string; name: string };
  checked: boolean;
  servings: number;
  onToggle: () => void;
  paddingTopClass: string;
}

function IngredientRow({ ing, checked, servings, onToggle, paddingTopClass }: IngredientRowProps) {
  return (
    <li className={paddingTopClass}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className="w-full flex gap-4 text-sm text-left items-baseline"
      >
        {ing.amount > 0 && (
          <span
            className={`font-medium tabular-nums w-20 shrink-0 ${
              checked ? "line-through text-ink-tertiary" : "text-ink-primary"
            }`}
          >
            {formatAmount(ing.amount, servings)}
            {ing.unit ? ` ${ing.unit}` : ""}
          </span>
        )}
        <span className={`flex-1 ${checked ? "line-through text-ink-tertiary" : "text-ink-secondary"}`}>
          {ing.name}
        </span>
        {checked && (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-4 h-4 shrink-0 text-forest self-center"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.5l3 3 7-7" />
          </svg>
        )}
      </button>
    </li>
  );
}

interface Props {
  recipe: Recipe;
  initialServings: number;
}

export default function CookMode({ recipe, initialServings }: Props) {
  const t = useTranslations("CookMode");
  const sections = useMemo(() => getRecipeSections(recipe), [recipe]);
  const multiSection = sections.length > 1 || sections[0]?.title !== null;

  // Stable reference — prevents the [stepIndex, cookSteps] reset-effect from firing on every render
  const cookSteps: CookStep[] = useMemo(
    () => sections.flatMap((section) =>
      section.steps.map((step) => ({ step, sectionTitle: section.title, ingredients: section.ingredients }))
    ),
    [sections]
  );

  const allIngredients = useMemo(
    () => sections.flatMap((s) => s.ingredients),
    [sections]
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  // The recipe's single active timer. timeLeft/timerStepIndex are null when no timer runs.
  // Once started, the timer belongs to timerStepIndex and keeps running across step navigation.
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStepIndex, setTimerStepIndex] = useState<number | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const mainRef = useRef<HTMLElement | null>(null);

  const toggleIngredient = useCallback((globalIdx: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(globalIdx)) next.delete(globalIdx);
      else next.add(globalIdx);
      return next;
    });
  }, []);

  // Reset scroll on every step change (instant, not smooth)
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [stepIndex]);

  const stepImageUrl = recipe.step_images?.[stepIndex] ?? null;
  const progressPct = cookSteps.length > 0 ? ((stepIndex + 1) / cookSteps.length) * 100 : 0;

  const currentCookStep = cookSteps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === cookSteps.length - 1;

  // The current step's own configured timer — may differ from the running timer's value.
  const currentStepTimer = currentCookStep?.step.timerSeconds ?? null;
  // Is the single active timer anchored to the step we're currently viewing?
  const activeTimerIsOnThisStep = timerStepIndex === stepIndex;
  const hasActiveTimer = timerStepIndex !== null && timeLeft !== null;
  // What the main timer area shows for the current step:
  //  - the live countdown when the active timer is on this step
  //  - nothing when a timer runs on another step (the pinned banner shows it instead)
  //  - otherwise this step's configured duration as a "ready to start" value
  const mainDisplaySeconds: number | null = activeTimerIsOnThisStep
    ? timeLeft
    : hasActiveTimer
      ? null
      : currentStepTimer;

  // Wake Lock
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let mounted = true;

    const acquire = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        if ("wakeLock" in navigator) {
          const lock = await navigator.wakeLock.request("screen");
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
    if (!timerRunning || timeLeft === null || timeLeft <= 0) return;
    const id = setTimeout(() => {
      const next = timeLeft - 1;
      setTimeLeft(next);
      if (next === 0) { setTimerRunning(false); playBeep(); }
    }, 1000);
    return () => clearTimeout(id);
  }, [timerRunning, timeLeft]);

  const handleStartPause = useCallback(() => {
    if (activeTimerIsOnThisStep) {
      if (timeLeft === 0) return; // finished — nothing to toggle
      setTimerRunning((r) => !r);
      return;
    }
    if (currentStepTimer === null) return; // this step has no timer to start
    // Start this step's timer. Only reachable when no timer is active: while one runs, the
    // start control is hidden on every other step (see mainDisplaySeconds), enforcing one timer.
    setTimerStepIndex(stepIndex);
    setTimeLeft(currentStepTimer);
    setTimerRunning(true);
  }, [activeTimerIsOnThisStep, timeLeft, currentStepTimer, stepIndex]);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimeLeft(null);
    setTimerStepIndex(null);
  }, []);

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          setStepIndex((i) => Math.min(cookSteps.length - 1, i + 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setStepIndex((i) => Math.max(0, i - 1));
          break;
        case "t":
        case "T":
          if (mainDisplaySeconds !== null && !(activeTimerIsOnThisStep && timeLeft === 0)) {
            e.preventDefault();
            handleStartPause();
          }
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cookSteps.length, mainDisplaySeconds, activeTimerIsOnThisStep, timeLeft, handleStartPause]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-primary">

      {/* safe-top-bar pushes the header below the iOS status bar (see globals.css).
          With viewport-fit=cover + a black-translucent status bar this full-screen
          header renders under the system UI; the class clears it on notched AND
          non-notched iPhones (where env(safe-area-inset-top) is 0) so the back link
          stays tappable. */}
      <header className="safe-top-bar flex items-center justify-between px-6 pb-4 border-b border-stone shrink-0">
        <Link
          href={`/${recipe.id}`}
          className="h-12 flex items-center text-sm text-ink-tertiary hover:text-ink-primary transition-colors"
        >
          ← {t("finish")}
        </Link>
        <div className="text-center">
          {/* h1 is always in the DOM for screen readers + document outline,
              but visually shown only on sm+ where there's room. */}
          <h1 className="text-xs text-ink-tertiary uppercase tracking-widest mb-0.5 sr-only sm:not-sr-only sm:block truncate max-w-[240px]">
            {recipe.title}
          </h1>
          <p className="text-lg font-medium text-ink-primary tabular-nums" aria-label={t("step", { current: stepIndex + 1, total: cookSteps.length })}>
            {stepIndex + 1} / {cookSteps.length}
          </p>
        </div>
        <div className="w-20" />
      </header>

      <div
        className="h-1 bg-stone shrink-0"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cookSteps.length}
        aria-valuenow={stepIndex + 1}
      >
        <div
          className="h-full bg-forest transition-[width] duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-6 py-10 max-w-[720px] mx-auto w-full flex flex-col gap-8">
        {/* Section label — shown above step text for multi-section recipes */}
        {multiSection && currentCookStep.sectionTitle && (
          <p className="label-overline text-forest">{currentCookStep.sectionTitle}</p>
        )}

        <p
          className="font-serif font-medium text-ink-primary leading-relaxed"
          style={{ fontSize: "clamp(1.4rem, 4vw, 1.875rem)" }}
        >
          {resolveStepText(currentCookStep.step.text, currentCookStep.ingredients, initialServings)}
        </p>

        {stepImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stepImageUrl}
            alt=""
            className="w-full rounded object-cover"
          />
        )}

        {mainDisplaySeconds !== null && (
          <div className="flex flex-col gap-5">
            <span
              className={`font-mono font-medium tabular-nums ${
                activeTimerIsOnThisStep && timeLeft === 0 ? "text-forest" : "text-ink-primary"
              }`}
              style={{ fontSize: "clamp(3rem, 10vw, 5rem)" }}
            >
              {activeTimerIsOnThisStep && timeLeft === 0
                ? `${t("timerDone")} ✓`
                : formatTime(mainDisplaySeconds)}
            </span>
            <div className="flex gap-3">
              <button
                onClick={handleStartPause}
                disabled={activeTimerIsOnThisStep && timeLeft === 0}
                aria-keyshortcuts="t"
                className="h-14 px-8 rounded bg-forest text-white font-medium hover:bg-forest-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-w-[120px]"
              >
                {activeTimerIsOnThisStep && timerRunning ? t("pauseTimer") : t("startTimer")}
              </button>
              <button
                onClick={resetTimer}
                className="h-14 px-8 rounded border border-stone text-ink-secondary font-medium hover:bg-surface-hover transition-colors min-w-[100px]"
              >
                {t("resetTimer")}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Persistent timer banner — keeps the active timer visible and controllable
          while the user browses to a different step. Tap the label to jump back. */}
      {timerStepIndex !== null && timeLeft !== null && !activeTimerIsOnThisStep && (
        <div
          role="group"
          aria-label={t("timerForStep", { step: timerStepIndex + 1 })}
          className="flex items-center gap-3 px-6 h-14 border-t border-stone bg-surface-secondary shrink-0"
        >
          <button
            type="button"
            onClick={() => setStepIndex(timerStepIndex)}
            className="flex flex-1 items-baseline gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
          >
            <span className="text-sm text-ink-tertiary truncate">
              ⏱ {t("step", { current: timerStepIndex + 1, total: cookSteps.length })}
            </span>
            <span
              className={`font-mono font-medium tabular-nums ml-auto ${
                timeLeft === 0 ? "text-forest" : "text-ink-primary"
              }`}
            >
              {timeLeft === 0 ? `${t("timerDone")} ✓` : formatTime(timeLeft)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTimerRunning((r) => !r)}
            disabled={timeLeft === 0}
            className="h-10 px-4 rounded border border-stone text-ink-secondary text-sm hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {timerRunning ? t("pauseTimer") : t("startTimer")}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            className="h-10 px-4 rounded border border-stone text-ink-secondary text-sm hover:bg-surface-hover transition-colors shrink-0"
          >
            {t("resetTimer")}
          </button>
        </div>
      )}

      <div className="border-t border-stone shrink-0">
        <button
          onClick={() => setShowIngredients((s) => !s)}
          className="w-full h-14 px-6 flex items-center justify-between text-ink-secondary hover:bg-surface-hover transition-colors"
        >
          <span className="text-sm font-medium">
            {t("ingredients")} ({initialServings} {t("servings")})
          </span>
          <span className="text-ink-tertiary text-sm">{showIngredients ? "▲" : "▼"}</span>
        </button>

        {showIngredients && (
          <div className="px-6 pb-5 bg-surface-secondary border-t border-stone">
            {multiSection
              ? sections.map((section, sIdx) => {
                  const sectionOffset = sections
                    .slice(0, sIdx)
                    .reduce((acc, s) => acc + s.ingredients.length, 0);
                  return (
                    <div key={sIdx}>
                      {section.title && (
                        <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wider pt-4 pb-2">
                          {section.title}
                        </p>
                      )}
                      <ul className="space-y-3">
                        {section.ingredients.map((ing, i) => {
                          const globalIdx = sectionOffset + i;
                          const checked = checkedIngredients.has(globalIdx);
                          return (
                            <IngredientRow
                              key={i}
                              ing={ing}
                              checked={checked}
                              servings={initialServings}
                              onToggle={() => toggleIngredient(globalIdx)}
                              paddingTopClass="pt-1"
                            />
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              : (
                <ul className="space-y-3">
                  {allIngredients.map((ing, i) => {
                    const checked = checkedIngredients.has(i);
                    return (
                      <IngredientRow
                        key={i}
                        ing={ing}
                        checked={checked}
                        servings={initialServings}
                        onToggle={() => toggleIngredient(i)}
                        paddingTopClass="pt-3"
                      />
                    );
                  })}
                </ul>
              )
            }
          </div>
        )}
      </div>

      {/* paddingBottom adds the iOS home-indicator inset (env(safe-area-inset-bottom))
          on top of the regular 16px, so the prev/next buttons clear the home
          indicator and stay tappable. The inset is 0 on devices without one. */}
      <nav
        className="flex gap-3 px-4 pt-4 border-t border-stone shrink-0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <button
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          aria-keyshortcuts="ArrowLeft"
          className="flex-1 h-14 rounded border border-stone text-ink-secondary font-medium hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← {t("previous")}
        </button>

        {isLast ? (
          <Link
            href={`/${recipe.id}`}
            onClick={() => {
              // Discovery: bump the cooked counter. Fire-and-forget — fails
              // silently for shared recipes (owner-scoped) or offline.
              void fetch(`/api/recipes/${recipe.id}/cooked`, { method: "POST" }).catch(() => {});
            }}
            className="flex-1 h-14 rounded bg-forest text-white font-medium hover:bg-forest-deep transition-colors flex items-center justify-center"
          >
            {t("finish")}!
          </Link>
        ) : (
          <button
            onClick={() => setStepIndex((i) => i + 1)}
            aria-keyshortcuts="ArrowRight Space"
            className="flex-1 h-14 rounded bg-ink-primary text-surface-primary font-medium hover:bg-ink-secondary transition-colors"
          >
            {t("next")} →
          </button>
        )}
      </nav>
    </div>
  );
}
