interface CalorieRingProps {
  consumed: number;
  target: number | null;
  /** Centre caption, e.g. "übrig" / "kcal". */
  remainingLabel: string;
  consumedLabel: string;
}

const SIZE = 168;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Calorie budget ring (custom SVG, no charting dependency). Shows consumed vs
 * target as an arc and the remaining kcal in the centre. When no target is set
 * it falls back to showing total consumed kcal.
 */
export default function CalorieRing({
  consumed,
  target,
  remainingLabel,
  consumedLabel,
}: CalorieRingProps) {
  const hasTarget = target != null && target > 0;
  const ratio = hasTarget ? Math.min(consumed / target, 1) : 0;
  const dashOffset = CIRCUMFERENCE * (1 - ratio);
  const over = hasTarget && consumed > target;
  const remaining = hasTarget ? Math.round(target - consumed) : 0;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-surface-secondary"
        />
        {hasTarget && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={over ? "stroke-red-500" : "stroke-forest"}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {hasTarget ? (
          <>
            <span
              className={`font-serif text-3xl font-medium tabular-nums ${
                over ? "text-red-600" : "text-ink-primary"
              }`}
            >
              {Math.abs(remaining)}
            </span>
            <span className="text-xs text-ink-tertiary mt-0.5">{remainingLabel}</span>
          </>
        ) : (
          <>
            <span className="font-serif text-3xl font-medium tabular-nums text-ink-primary">
              {Math.round(consumed)}
            </span>
            <span className="text-xs text-ink-tertiary mt-0.5">{consumedLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
