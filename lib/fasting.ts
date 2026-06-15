// Pure intermittent-fasting math + presets (Feature 19, Phase 3). No I/O — directly
// unit-testable. The live timer UI feeds `now` from the client clock each tick.

export type FastingPresetId = "16:8" | "18:6" | "20:4" | "omad" | "custom";

export interface FastingPreset {
  id: Exclude<FastingPresetId, "custom">;
  hours: number;
}

export const FASTING_PRESETS: readonly FastingPreset[] = [
  { id: "16:8", hours: 16 },
  { id: "18:6", hours: 18 },
  { id: "20:4", hours: 20 },
  { id: "omad", hours: 23 },
] as const;

export interface FastingProgress {
  elapsedSeconds: number;
  /** Negative once the goal is passed (overtime). */
  remainingSeconds: number;
  /** 0–1, clamped. */
  percent: number;
  isComplete: boolean;
}

export function computeFastingProgress(
  startedAtIso: string,
  targetHours: number,
  now: Date = new Date()
): FastingProgress {
  const startMs = new Date(startedAtIso).getTime();
  const targetSeconds = targetHours * 3600;
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
  const remainingSeconds = targetSeconds - elapsedSeconds;
  const percent = targetSeconds > 0 ? Math.min(1, Math.max(0, elapsedSeconds / targetSeconds)) : 0;
  return {
    elapsedSeconds,
    remainingSeconds,
    percent,
    isComplete: elapsedSeconds >= targetSeconds,
  };
}

/** Format a non-negative duration as "Hh Mm" (drops the hours part when zero). */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Format a duration as H:MM:SS (used by the live ticking timer). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
