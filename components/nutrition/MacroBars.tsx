interface MacroBarProps {
  label: string;
  consumed: number;
  target: number | null;
  unit: string;
}

function MacroBar({ label, consumed, target, unit }: MacroBarProps) {
  const hasTarget = target != null && target > 0;
  const ratio = hasTarget ? Math.min(consumed / target, 1) : 0;
  const over = hasTarget && consumed > target;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-ink-secondary">{label}</span>
        <span className="text-xs text-ink-tertiary tabular-nums">
          {Math.round(consumed)}
          {hasTarget ? ` / ${Math.round(target)}` : ""} {unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-forest"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

interface MacroBarsProps {
  consumed: { protein_g: number; carbs_g: number; fat_g: number };
  target: { protein_g: number; carbs_g: number; fat_g: number } | null;
  labels: { protein: string; carbs: string; fat: string };
  unit: string;
}

export default function MacroBars({ consumed, target, labels, unit }: MacroBarsProps) {
  return (
    <div className="space-y-3">
      <MacroBar label={labels.protein} consumed={consumed.protein_g} target={target?.protein_g ?? null} unit={unit} />
      <MacroBar label={labels.carbs} consumed={consumed.carbs_g} target={target?.carbs_g ?? null} unit={unit} />
      <MacroBar label={labels.fat} consumed={consumed.fat_g} target={target?.fat_g ?? null} unit={unit} />
    </div>
  );
}
