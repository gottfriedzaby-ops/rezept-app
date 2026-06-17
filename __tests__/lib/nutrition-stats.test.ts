import {
  getStatsRange,
  sumEntries,
  dailyTotals,
  buildBuckets,
  buildStatsSummary,
  metricValue,
} from "@/lib/nutrition-stats";
import { snapToWeekStart } from "@/lib/meal-plan";
import type { FoodLogEntry } from "@/types/nutrition";

const REF = "2026-06-17";

function makeEntry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: "e",
    created_at: "2026-06-17T08:00:00Z",
    user_id: "u",
    recipe_id: null,
    date: REF,
    meal_slot: "mittag",
    source: "manual",
    label: "Test",
    servings: 1,
    kcal_per_serving: 500,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    ...overrides,
  };
}

describe("getStatsRange", () => {
  it("returns the last 7 days for week", () => {
    expect(getStatsRange(REF, "week")).toEqual({
      start: "2026-06-11",
      end: "2026-06-17",
      days: 7,
    });
  });

  it("returns the last 30 days for month", () => {
    expect(getStatsRange(REF, "month")).toEqual({
      start: "2026-05-19",
      end: "2026-06-17",
      days: 30,
    });
  });

  it("snaps the 6-months start back to a Monday and spans >= 180 days", () => {
    const r = getStatsRange(REF, "6months");
    expect(r.end).toBe(REF);
    expect(r.start).toBe(snapToWeekStart(r.start));
    expect(new Date(`${r.start}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
    expect(r.days).toBeGreaterThanOrEqual(180);
    expect(r.days).toBeLessThanOrEqual(186);
  });

  it("computes the window in UTC regardless of a late-day reference", () => {
    // Reference is a plain ISO date, so there is no local-tz drift.
    expect(getStatsRange("2026-01-01", "week").start).toBe("2025-12-26");
  });
});

describe("sumEntries", () => {
  it("multiplies per-serving values by servings and rounds", () => {
    const totals = sumEntries([
      makeEntry({ servings: 2, kcal_per_serving: 500, protein_g: 10, carbs_g: 20, fat_g: 5 }),
      makeEntry({ servings: 1, kcal_per_serving: 250, protein_g: 5, carbs_g: 10, fat_g: 2 }),
    ]);
    expect(totals).toEqual({ kcal: 1250, protein_g: 25, carbs_g: 50, fat_g: 12 });
  });

  it("returns zeros for no entries", () => {
    expect(sumEntries([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe("dailyTotals", () => {
  it("groups entries by date and sums each day", () => {
    const map = dailyTotals([
      makeEntry({ date: "2026-06-16", kcal_per_serving: 400 }),
      makeEntry({ date: "2026-06-16", kcal_per_serving: 100 }),
      makeEntry({ date: "2026-06-17", kcal_per_serving: 700 }),
    ]);
    expect(map.size).toBe(2);
    expect(map.get("2026-06-16")?.kcal).toBe(500);
    expect(map.get("2026-06-17")?.kcal).toBe(700);
  });
});

describe("buildBuckets", () => {
  it("produces one zero-filled daily bucket per calendar day for week", () => {
    const range = getStatsRange(REF, "week");
    const buckets = buildBuckets([makeEntry({ date: "2026-06-13", kcal_per_serving: 600 })], range, "week");
    expect(buckets).toHaveLength(7);
    expect(buckets[0].key).toBe("2026-06-11");
    expect(buckets.every((b) => b.kind === "daily")).toBe(true);
    const logged = buckets.find((b) => b.key === "2026-06-13");
    expect(logged?.totals.kcal).toBe(600);
    expect(logged?.daysLogged).toBe(1);
    const gap = buckets.find((b) => b.key === "2026-06-12");
    expect(gap?.totals.kcal).toBe(0);
    expect(gap?.daysLogged).toBe(0);
  });

  it("averages each week over its logged days for the 6-months view", () => {
    const range = getStatsRange(REF, "6months");
    // Two logged days in the same Monday week near the end of the range.
    const buckets = buildBuckets(
      [
        makeEntry({ date: "2026-06-16", kcal_per_serving: 2000 }),
        makeEntry({ date: "2026-06-17", kcal_per_serving: 1000 }),
      ],
      range,
      "6months"
    );
    expect(buckets.every((b) => b.kind === "weekly")).toBe(true);
    const wkKey = snapToWeekStart("2026-06-17");
    const wk = buckets.find((b) => b.key === wkKey);
    expect(wk?.daysLogged).toBe(2);
    expect(wk?.totals.kcal).toBe(1500); // (2000 + 1000) / 2 days logged
    // weeks with no entries are present but zero
    expect(buckets.some((b) => b.daysLogged === 0 && b.totals.kcal === 0)).toBe(true);
  });
});

describe("buildStatsSummary", () => {
  it("returns null averages and zero adherence when nothing is logged", () => {
    const s = buildStatsSummary([], REF, "week");
    expect(s.averages).toBeNull();
    expect(s.daysLogged).toBe(0);
    expect(s.adherence).toBe(0);
    expect(s.totalEntries).toBe(0);
    expect(s.buckets).toHaveLength(7);
  });

  it("averages over days logged, not calendar days", () => {
    const s = buildStatsSummary(
      [
        makeEntry({ date: "2026-06-16", kcal_per_serving: 1000 }),
        makeEntry({ date: "2026-06-17", kcal_per_serving: 2000 }),
      ],
      REF,
      "week"
    );
    expect(s.daysLogged).toBe(2);
    expect(s.calendarDays).toBe(7);
    expect(s.averages?.kcal).toBe(1500); // (1000 + 2000) / 2 logged days
    expect(s.adherence).toBeCloseTo(2 / 7, 5);
    expect(s.totalEntries).toBe(2);
  });

  it("ignores entries outside the range", () => {
    const s = buildStatsSummary(
      [
        makeEntry({ date: "2026-06-17", kcal_per_serving: 1000 }),
        makeEntry({ date: "2026-01-01", kcal_per_serving: 9999 }), // far outside week
      ],
      REF,
      "week"
    );
    expect(s.daysLogged).toBe(1);
    expect(s.totalEntries).toBe(1);
    expect(s.averages?.kcal).toBe(1000);
  });

  it("uses weekly buckets for the 6-months range", () => {
    const s = buildStatsSummary([makeEntry({ date: REF })], REF, "6months");
    expect(s.buckets.every((b) => b.kind === "weekly")).toBe(true);
    expect(s.buckets.length).toBeGreaterThanOrEqual(26);
  });
});

describe("metricValue", () => {
  it("picks the requested metric", () => {
    const totals = { kcal: 1800, protein_g: 90, carbs_g: 200, fat_g: 60 };
    expect(metricValue(totals, "kcal")).toBe(1800);
    expect(metricValue(totals, "protein_g")).toBe(90);
    expect(metricValue(totals, "carbs_g")).toBe(200);
    expect(metricValue(totals, "fat_g")).toBe(60);
  });
});
