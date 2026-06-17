"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useToast } from "@/contexts/ToastContext";
import NutritionTrendChart from "@/components/nutrition/NutritionTrendChart";
import {
  STATS_METRICS,
  STATS_RANGES,
  metricValue,
  type NutritionStatsResponse,
  type StatsMetric,
  type StatsRange,
} from "@/lib/nutrition-stats";

interface NutritionInsightsProps {
  /** Switches the parent dashboard back to the diary view (empty-state CTA). */
  onBackToDiary?: () => void;
}

const RANGE_LABEL_KEY: Record<StatsRange, string> = {
  week: "week",
  month: "month",
  "6months": "sixMonths",
};
const METRIC_LABEL_KEY: Record<StatsMetric, string> = {
  kcal: "kcal",
  protein_g: "protein",
  carbs_g: "carbs",
  fat_g: "fat",
};

const SEGMENT_BASE = "text-sm px-4 py-2 rounded border transition-colors";
const SEGMENT_ACTIVE = "border-forest bg-forest-soft text-forest-deep font-medium";
const SEGMENT_INACTIVE = "border-stone text-ink-secondary hover:bg-surface-hover";

/** Noon UTC keeps Intl date formatting on the right calendar day in any timezone. */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export default function NutritionInsights({ onBackToDiary }: NutritionInsightsProps) {
  const t = useTranslations("Nutrition");
  const format = useFormatter();
  const { showToast } = useToast();

  const [range, setRange] = useState<StatsRange>("week");
  const [metric, setMetric] = useState<StatsMetric>("kcal");
  const [cache, setCache] = useState<Partial<Record<StatsRange, NutritionStatsResponse>>>({});
  const [loading, setLoading] = useState(false);

  // Ranges already requested (synchronous dedupe so a re-render mid-flight can't
  // trigger a second fetch); `mounted` guards setState after unmount.
  const requested = useRef<Set<StatsRange>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const data = cache[range] ?? null;

  useEffect(() => {
    if (requested.current.has(range)) return;
    requested.current.add(range);
    setLoading(true);
    fetch(`/api/nutrition/stats?range=${range}`)
      .then((res) => res.json())
      .then((json: { data: NutritionStatsResponse | null; error: string | null }) => {
        if (!mounted.current) return;
        if (json.data) {
          setCache((prev) => ({ ...prev, [range]: json.data as NutritionStatsResponse }));
        } else {
          requested.current.delete(range);
          showToast(t("insights.loadError"));
        }
      })
      .catch(() => {
        if (!mounted.current) return;
        requested.current.delete(range);
        showToast(t("insights.loadError"));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, [range, t, showToast]);

  const metricUnit = metric === "kcal" ? t("units.kcal") : t("units.gram");
  const metricLabel = t(`insights.metric.${METRIC_LABEL_KEY[metric]}`);

  // X-axis labels, formatted per range from the bucket keys.
  const xLabels = useMemo(() => {
    if (!data) return [];
    return data.summary.buckets.map((b) => {
      const d = isoToDate(b.key);
      if (range === "week") return format.dateTime(d, { weekday: "short" });
      if (range === "month") return format.dateTime(d, { day: "numeric" });
      return format.dateTime(d, { day: "numeric", month: "numeric" });
    });
  }, [data, range, format]);

  return (
    <div>
      {/* Range switcher */}
      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label={t("insights.title")}>
        {STATS_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`${SEGMENT_BASE} ${range === r ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
          >
            {t(`insights.range.${RANGE_LABEL_KEY[r]}`)}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="rounded-lg border border-stone bg-surface-card p-6">
          <div className="h-48 rounded bg-surface-secondary animate-pulse" />
        </div>
      ) : !data ? null : data.summary.daysLogged === 0 ? (
        // Empty state
        <div className="rounded-lg border border-stone bg-surface-card p-8 text-center">
          <p className="text-sm text-ink-secondary mb-4">{t("insights.empty")}</p>
          {onBackToDiary && (
            <button
              type="button"
              onClick={onBackToDiary}
              className="text-sm px-4 py-2 rounded border border-stone text-ink-secondary hover:bg-surface-hover transition-colors"
            >
              {t("insights.emptyCta")}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Metric switcher */}
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label={metricLabel}>
            {STATS_METRICS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                className={`${SEGMENT_BASE} ${metric === m ? SEGMENT_ACTIVE : SEGMENT_INACTIVE}`}
              >
                {t(`insights.metric.${METRIC_LABEL_KEY[m]}`)}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-lg border border-stone bg-surface-card p-4 sm:p-6 mb-6">
            <NutritionTrendChart
              buckets={data.summary.buckets}
              metric={metric}
              target={data.target ? metricValue(data.target, metric) : null}
              xLabels={xLabels}
              ariaLabel={t("insights.chartLabel", { metric: metricLabel })}
              unit={metricUnit}
            />
            <p className="text-xs text-ink-tertiary mt-3">{t("insights.avgNote")}</p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard title={t("insights.kpi.avgDaily")}>
              <p className="font-serif text-3xl font-medium tabular-nums text-ink-primary">
                {data.summary.averages?.kcal ?? 0}
                {data.target ? (
                  <span className="text-base text-ink-tertiary"> / {data.target.kcal}</span>
                ) : null}
                <span className="text-sm text-ink-tertiary"> {t("units.kcal")}</span>
              </p>
            </KpiCard>

            <KpiCard title={t("insights.kpi.macros")}>
              <dl className="space-y-1">
                <MacroRow
                  label={t("goals.protein")}
                  value={data.summary.averages?.protein_g ?? 0}
                  target={data.target?.protein_g ?? null}
                  unit={t("units.gram")}
                />
                <MacroRow
                  label={t("goals.carbs")}
                  value={data.summary.averages?.carbs_g ?? 0}
                  target={data.target?.carbs_g ?? null}
                  unit={t("units.gram")}
                />
                <MacroRow
                  label={t("goals.fat")}
                  value={data.summary.averages?.fat_g ?? 0}
                  target={data.target?.fat_g ?? null}
                  unit={t("units.gram")}
                />
              </dl>
            </KpiCard>

            <KpiCard title={t("insights.kpi.daysLogged")}>
              <p className="font-serif text-3xl font-medium tabular-nums text-ink-primary">
                {data.summary.daysLogged}
                <span className="text-base text-ink-tertiary"> / {data.summary.calendarDays}</span>
              </p>
              <p className="text-xs text-ink-tertiary mt-1">
                {t("insights.kpi.adherence", { pct: Math.round(data.summary.adherence * 100) })}
              </p>
            </KpiCard>
          </div>

          {data.summary.daysLogged <= 2 && (
            <p className="text-xs text-ink-tertiary mt-4">{t("insights.insufficient")}</p>
          )}
          <p className="text-xs text-ink-tertiary mt-6">{t("disclaimer")}</p>
        </>
      )}
    </div>
  );
}

interface KpiCardProps {
  title: string;
  children: React.ReactNode;
}

function KpiCard({ title, children }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-stone bg-surface-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary mb-2">{title}</p>
      {children}
    </div>
  );
}

interface MacroRowProps {
  label: string;
  value: number;
  target: number | null;
  unit: string;
}

function MacroRow({ label, value, target, unit }: MacroRowProps) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-xs text-ink-secondary">{label}</dt>
      <dd className="text-sm tabular-nums text-ink-primary">
        {value}
        {target != null ? <span className="text-ink-tertiary"> / {target}</span> : null} {unit}
      </dd>
    </div>
  );
}
