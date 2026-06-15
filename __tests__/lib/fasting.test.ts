import {
  FASTING_PRESETS,
  computeFastingProgress,
  formatDuration,
  formatClock,
} from "@/lib/fasting";

const START = "2026-06-15T08:00:00.000Z";

describe("FASTING_PRESETS", () => {
  it("maps the four presets to their fasting-window hours", () => {
    expect(FASTING_PRESETS.map((p) => [p.id, p.hours])).toEqual([
      ["16:8", 16],
      ["18:6", 18],
      ["20:4", 20],
      ["omad", 23],
    ]);
  });
});

describe("computeFastingProgress", () => {
  it("reports a partial fast mid-window", () => {
    const now = new Date("2026-06-15T16:00:00.000Z"); // 8h into a 16h fast
    const p = computeFastingProgress(START, 16, now);
    expect(p.elapsedSeconds).toBe(8 * 3600);
    expect(p.remainingSeconds).toBe(8 * 3600);
    expect(p.percent).toBeCloseTo(0.5, 5);
    expect(p.isComplete).toBe(false);
  });

  it("clamps percent to 1 and marks complete at the goal", () => {
    const now = new Date("2026-06-16T00:00:00.000Z"); // exactly 16h
    const p = computeFastingProgress(START, 16, now);
    expect(p.percent).toBe(1);
    expect(p.isComplete).toBe(true);
    expect(p.remainingSeconds).toBe(0);
  });

  it("reports negative remaining (overtime) past the goal", () => {
    const now = new Date("2026-06-16T02:00:00.000Z"); // 18h into a 16h fast
    const p = computeFastingProgress(START, 16, now);
    expect(p.isComplete).toBe(true);
    expect(p.percent).toBe(1);
    expect(p.remainingSeconds).toBe(-2 * 3600);
  });

  it("never goes negative on elapsed for a future start", () => {
    const now = new Date("2026-06-15T07:00:00.000Z"); // before start
    const p = computeFastingProgress(START, 16, now);
    expect(p.elapsedSeconds).toBe(0);
    expect(p.percent).toBe(0);
  });
});

describe("formatDuration / formatClock", () => {
  it("formats durations under an hour as minutes", () => {
    expect(formatDuration(45 * 60)).toBe("45 min");
  });
  it("formats longer durations as hours + minutes", () => {
    expect(formatDuration(16 * 3600 + 5 * 60)).toBe("16 h 05 min");
  });
  it("formats the live clock as H:MM:SS", () => {
    expect(formatClock(8 * 3600 + 9 * 60 + 7)).toBe("8:09:07");
  });
});
