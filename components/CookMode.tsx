"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Recipe } from "@/types/recipe";

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  recipe: Recipe;
  initialServings: number;
}

export default function CookMode({ recipe, initialServings }: Props) {
  const steps = recipe.steps;

  const [stepIndex, setStepIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(
    steps[0]?.timerSeconds ?? null
  );
  const [timerRunning, setTimerRunning] = useState(false);

  const currentStep = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  // ── Wake Lock ──────────────────────────────────────────────────────────────
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

    const onVisChange = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisChange);
      sentinel?.release().catch(() => {});
    };
  }, []);

  // ── Reset timer whenever the step changes ──────────────────────────────────
  useEffect(() => {
    setTimerRunning(false);
    setTimeLeft(steps[stepIndex]?.timerSeconds ?? null);
  }, [stepIndex, steps]);

  // ── Countdown — one setTimeout per tick ───────────────────────────────────
  useEffect(() => {
    if (!timerRunning || timeLeft === null || timeLeft <= 0) return;

    const id = setTimeout(() => {
      const next = timeLeft - 1;
      setTimeLeft(next);
      if (next === 0) {
        setTimerRunning(false);
        playBeep();
      }
    }, 1000);

    return () => clearTimeout(id);
  }, [timerRunning, timeLeft]);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimeLeft(currentStep?.timerSeconds ?? null);
  }, [currentStep]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <Link
          href={`/${recipe.id}`}
          className="h-16 flex items-center gap-2 text-gray-500 hover:text-gray-900 pr-4"
        >
          ✕ Beenden
        </Link>
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">{recipe.title}</p>
          <p className="text-lg font-semibold tabular-nums">
            {stepIndex + 1} / {steps.length}
          </p>
        </div>
        {/* spacer to keep counter centred */}
        <div className="w-24" />
      </header>

      {/* ── Step content ── */}
      <main className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8">
        <p
          className="text-2xl leading-relaxed font-medium text-gray-900"
          style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)" }}
        >
          {currentStep.text}
        </p>

        {/* Timer */}
        {timeLeft !== null && (
          <div className="flex flex-col gap-4">
            <span
              className={`font-mono font-bold tabular-nums ${
                timeLeft === 0 ? "text-green-600" : "text-gray-800"
              }`}
              style={{ fontSize: "clamp(3rem, 10vw, 5rem)" }}
            >
              {timeLeft === 0 ? "Fertig! ✓" : formatTime(timeLeft)}
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setTimerRunning((r) => !r)}
                disabled={timeLeft === 0}
                className="h-16 px-8 rounded-xl bg-blue-600 text-white text-lg font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed min-w-[130px]"
              >
                {timerRunning ? "Pause" : "Start"}
              </button>
              <button
                onClick={resetTimer}
                className="h-16 px-8 rounded-xl border border-gray-300 text-gray-700 text-lg font-semibold hover:bg-gray-50 min-w-[110px]"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ── Ingredients accordion ── */}
      <div className="border-t shrink-0">
        <button
          onClick={() => setShowIngredients((s) => !s)}
          className="w-full h-16 px-5 flex items-center justify-between text-gray-700 hover:bg-gray-50"
        >
          <span className="font-medium">
            Zutaten für {initialServings} Portion{initialServings !== 1 ? "en" : ""}
          </span>
          <span className="text-gray-400 text-lg">{showIngredients ? "▲" : "▼"}</span>
        </button>

        {showIngredients && (
          <ul className="px-5 pb-4 space-y-2 bg-gray-50">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex gap-3 text-base">
                {ing.amount > 0 && (
                  <span className="font-medium tabular-nums min-w-[5rem] shrink-0">
                    {formatAmount(ing.amount, initialServings)}
                    {ing.unit ? ` ${ing.unit}` : ""}
                  </span>
                )}
                <span>{ing.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex gap-3 p-4 border-t shrink-0">
        <button
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className="flex-1 h-16 rounded-xl border border-gray-300 text-gray-700 text-lg font-semibold hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Zurück
        </button>

        {isLast ? (
          <Link
            href={`/${recipe.id}`}
            className="flex-1 h-16 rounded-xl bg-green-600 text-white text-lg font-semibold hover:bg-green-700 flex items-center justify-center"
          >
            Fertig! 🎉
          </Link>
        ) : (
          <button
            onClick={() => setStepIndex((i) => i + 1)}
            className="flex-1 h-16 rounded-xl bg-gray-900 text-white text-lg font-semibold hover:bg-gray-800"
          >
            Weiter →
          </button>
        )}
      </nav>
    </div>
  );
}
