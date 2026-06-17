import { metricValue, type StatsBucket, type StatsMetric } from "@/lib/nutrition-stats";

interface NutritionTrendChartProps {
  buckets: StatsBucket[];
  metric: StatsMetric;
  /** Per-day target for the selected metric; null hides the reference line. */
  target: number | null;
  /** One pre-formatted x-axis label per bucket (built by the parent via next-intl). */
  xLabels: string[];
  /** Accessible series description, e.g. "Kalorien pro Tag". */
  ariaLabel: string;
  /** Value unit shown in tooltips / axis ("kcal" | "g"). */
  unit: string;
}

const W = 640;
const H = 240;
const PAD = { top: 16, right: 8, bottom: 28, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BASELINE_Y = PAD.top + PLOT_H;

/**
 * Pure-SVG bar chart for a single nutrition metric over time, with an optional
 * dashed per-day target line. No charting dependency — mirrors the CalorieRing
 * SVG idiom; Tailwind `fill-*`/`stroke-*` classes flip automatically in dark mode.
 */
export default function NutritionTrendChart({
  buckets,
  metric,
  target,
  xLabels,
  ariaLabel,
  unit,
}: NutritionTrendChartProps) {
  if (buckets.length === 0) return null;

  const values = buckets.map((b) => metricValue(b.totals, metric));
  const max = Math.max(...values, target ?? 0) * 1.1 || 1;

  const slot = PLOT_W / buckets.length;
  const barWidth = Math.max(2, slot * 0.7);
  // Keep x labels legible: show roughly ten, always including the first.
  const labelStep = Math.max(1, Math.ceil(buckets.length / 10));
  const targetY = target != null ? BASELINE_Y - (target / max) * PLOT_H : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <title>{ariaLabel}</title>

      {/* Axis baseline + top scale label */}
      <line
        x1={PAD.left}
        y1={BASELINE_Y}
        x2={PAD.left + PLOT_W}
        y2={BASELINE_Y}
        className="stroke-surface-secondary"
        strokeWidth={1}
      />
      <text x={4} y={PAD.top + 4} className="fill-ink-tertiary" fontSize={11}>
        {Math.round(max)}
      </text>
      <text x={4} y={BASELINE_Y} className="fill-ink-tertiary" fontSize={11}>
        0
      </text>

      {/* Bars */}
      {buckets.map((bucket, i) => {
        const value = values[i];
        const barH = (value / max) * PLOT_H;
        const x = PAD.left + i * slot + (slot - barWidth) / 2;
        const y = BASELINE_Y - barH;
        const over = target != null && value > target;
        return (
          <rect
            key={bucket.key}
            x={x}
            y={y}
            width={barWidth}
            height={barH}
            rx={1}
            className={over ? "fill-red-500" : "fill-forest"}
          >
            <title>{`${xLabels[i]}: ${value} ${unit}`}</title>
          </rect>
        );
      })}

      {/* Per-day target reference line */}
      {targetY != null && (
        <line
          x1={PAD.left}
          y1={targetY}
          x2={PAD.left + PLOT_W}
          y2={targetY}
          className="stroke-stone"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      )}

      {/* X-axis labels */}
      {buckets.map((bucket, i) =>
        i % labelStep === 0 ? (
          <text
            key={`label-${bucket.key}`}
            x={PAD.left + i * slot + slot / 2}
            y={H - 8}
            textAnchor="middle"
            className="fill-ink-tertiary"
            fontSize={11}
          >
            {xLabels[i]}
          </text>
        ) : null
      )}
    </svg>
  );
}
