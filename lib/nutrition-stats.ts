// Pure aggregation math for the nutrition insights dashboard. No I/O — directly
// unit-testable. All date arithmetic is UTC ISO-string math (YYYY-MM-DD), reusing
// the meal-plan helpers, so the diary day boundary stays at UTC midnight exactly
// like the rest of the nutrition code.
//
// KEY SEMANTIC: "average per day" everywhere divides by the number of days that
// were actually LOGGED (>= 1 entry), never by all calendar days in the range. The
// diary is opt-in and sparse, so dividing by every calendar day would make every
// average read as failure. The separate `adherence` figure carries the coverage
// signal. Weekly chart bars (6-months view) are likewise the average daily total
// over the logged days within that week, so the per-day target line stays
// comparable across week / month / 6-months ranges.

import { addDays, snapToWeekStart } from "@/lib/meal-plan";
import type { FoodLogEntry, MacroTotals } from "@/types/nutrition";

export type StatsRange = "week" | "month" | "6months";
export type StatsMetric = "kcal" | "protein_g" | "carbs_g" | "fat_g";

export const STATS_RANGES: readonly StatsRange[] = ["week", "month", "6months"] as const;
export const STATS_METRICS: readonly StatsMetric[] = [
  "kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
] as const;

/** Inclusive ISO date window [start, end] for a range ending at `referenceIso`. */
export interface DateRange {
  start: string;
  end: string;
  /** Number of calendar days in [start, end] inclusive. */
  days: number;
}

/** One chart bar. `totals` is per-day (weekly bars = avg over the week's logged days). */
export interface StatsBucket {
  /** ISO date: the day (daily) or the week-start Monday (weekly). */
  key: string;
  kind: "daily" | "weekly";
  totals: MacroTotals;
  /** Days inside this bucket with >= 1 entry (1/0 for daily, 0..7 for weekly). */
  daysLogged: number;
}

export interface StatsSummary {
  range: StatsRange;
  dateRange: DateRange;
  /** Chart bars, chronological. Array (not Map) so it serializes server→client. */
  buckets: StatsBucket[];
  /** Average DAILY totals over days logged; null when nothing was logged. */
  averages: MacroTotals | null;
  /** Distinct dates in range with >= 1 entry. */
  daysLogged: number;
  /** Calendar days in the range (= dateRange.days). */
  calendarDays: number;
  /** daysLogged / calendarDays, 0..1. */
  adherence: number;
  totalEntries: number;
}

function zero(): MacroTotals {
  return { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
}

function roundTotals(t: MacroTotals): MacroTotals {
  return {
    kcal: Math.round(t.kcal),
    protein_g: Math.round(t.protein_g),
    carbs_g: Math.round(t.carbs_g),
    fat_g: Math.round(t.fat_g),
  };
}

/** Calendar days in [startIso, endIso] inclusive (UTC). */
function daysInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Inclusive date window for a range ending at `referenceIso` (today, UTC).
 * - week:     last 7 days (start = ref − 6).
 * - month:    last 30 days (start = ref − 29).
 * - 6months:  last 180 days, start snapped back to its Monday so the weekly
 *             buckets are whole weeks; `days` reflects the snapped span.
 */
export function getStatsRange(referenceIso: string, range: StatsRange): DateRange {
  const end = referenceIso;
  let start: string;
  if (range === "week") {
    start = addDays(end, -6);
  } else if (range === "month") {
    start = addDays(end, -29);
  } else {
    start = snapToWeekStart(addDays(end, -179));
  }
  return { start, end, days: daysInclusive(start, end) };
}

/** Sum a set of entries into rounded MacroTotals (entry total = per-serving × servings). */
export function sumEntries(entries: FoodLogEntry[]): MacroTotals {
  const raw = entries.reduce<MacroTotals>((acc, e) => {
    const s = e.servings;
    acc.kcal += e.kcal_per_serving * s;
    acc.protein_g += e.protein_g * s;
    acc.carbs_g += e.carbs_g * s;
    acc.fat_g += e.fat_g * s;
    return acc;
  }, zero());
  return roundTotals(raw);
}

/** Group entries by their `date` into rounded per-day totals. Only logged days appear. */
export function dailyTotals(entries: FoodLogEntry[]): Map<string, MacroTotals> {
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  const out = new Map<string, MacroTotals>();
  byDate.forEach((list, date) => out.set(date, sumEntries(list)));
  return out;
}

/**
 * Bucket entries across a range into chart bars:
 * - week / month: one zero-filled bucket per calendar day (gaps render as zero bars).
 * - 6months:      one bucket per Monday-started week; value = average daily total
 *                 over the week's logged days (zero when the week has no entries).
 */
export function buildBuckets(
  entries: FoodLogEntry[],
  range: DateRange,
  mode: StatsRange
): StatsBucket[] {
  const daily = dailyTotals(entries);

  if (mode === "6months") {
    const weeks = new Map<string, { sum: MacroTotals; daysLogged: number }>();
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
      const wk = snapToWeekStart(d);
      let acc = weeks.get(wk);
      if (!acc) {
        acc = { sum: zero(), daysLogged: 0 };
        weeks.set(wk, acc);
      }
      const day = daily.get(d);
      if (day) {
        acc.sum.kcal += day.kcal;
        acc.sum.protein_g += day.protein_g;
        acc.sum.carbs_g += day.carbs_g;
        acc.sum.fat_g += day.fat_g;
        acc.daysLogged += 1;
      }
    }
    return Array.from(weeks.entries()).map(([key, acc]) => ({
      key,
      kind: "weekly" as const,
      daysLogged: acc.daysLogged,
      totals:
        acc.daysLogged > 0
          ? roundTotals({
              kcal: acc.sum.kcal / acc.daysLogged,
              protein_g: acc.sum.protein_g / acc.daysLogged,
              carbs_g: acc.sum.carbs_g / acc.daysLogged,
              fat_g: acc.sum.fat_g / acc.daysLogged,
            })
          : zero(),
    }));
  }

  const out: StatsBucket[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    const totals = daily.get(d);
    out.push({
      key: d,
      kind: "daily",
      totals: totals ?? zero(),
      daysLogged: totals ? 1 : 0,
    });
  }
  return out;
}

/** Full stats summary for a range ending at `referenceIso`. */
export function buildStatsSummary(
  entries: FoodLogEntry[],
  referenceIso: string,
  range: StatsRange
): StatsSummary {
  const dateRange = getStatsRange(referenceIso, range);
  const inRange = entries.filter(
    (e) => e.date >= dateRange.start && e.date <= dateRange.end
  );
  const daily = dailyTotals(inRange);
  const buckets = buildBuckets(inRange, dateRange, range);

  const daysLogged = daily.size;
  let averages: MacroTotals | null = null;
  if (daysLogged > 0) {
    const sum = zero();
    daily.forEach((t) => {
      sum.kcal += t.kcal;
      sum.protein_g += t.protein_g;
      sum.carbs_g += t.carbs_g;
      sum.fat_g += t.fat_g;
    });
    averages = roundTotals({
      kcal: sum.kcal / daysLogged,
      protein_g: sum.protein_g / daysLogged,
      carbs_g: sum.carbs_g / daysLogged,
      fat_g: sum.fat_g / daysLogged,
    });
  }

  return {
    range,
    dateRange,
    buckets,
    averages,
    daysLogged,
    calendarDays: dateRange.days,
    adherence: dateRange.days > 0 ? daysLogged / dateRange.days : 0,
    totalEntries: inRange.length,
  };
}

/** Pick one metric out of MacroTotals for the chart / KPI. */
export function metricValue(totals: MacroTotals, metric: StatsMetric): number {
  return totals[metric];
}

/** Response payload of GET /api/nutrition/stats. */
export interface NutritionStatsResponse {
  summary: StatsSummary;
  /** Per-day macro targets from the profile; null when none are set. */
  target: MacroTotals | null;
}
