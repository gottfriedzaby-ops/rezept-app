import { render, screen } from "@testing-library/react";
import NutritionTrendChart from "@/components/nutrition/NutritionTrendChart";
import type { StatsBucket } from "@/lib/nutrition-stats";

function makeBucket(key: string, kcal: number, daysLogged = 1): StatsBucket {
  return {
    key,
    kind: "daily",
    totals: { kcal, protein_g: 0, carbs_g: 0, fat_g: 0 },
    daysLogged,
  };
}

function renderChart(props: Partial<React.ComponentProps<typeof NutritionTrendChart>> = {}) {
  const buckets = props.buckets ?? [
    makeBucket("2026-06-15", 1000),
    makeBucket("2026-06-16", 3000),
    makeBucket("2026-06-17", 0, 0),
  ];
  return render(
    <NutritionTrendChart
      buckets={buckets}
      metric={props.metric ?? "kcal"}
      target={"target" in props ? props.target ?? null : 2000}
      xLabels={props.xLabels ?? buckets.map((b) => b.key)}
      ariaLabel={props.ariaLabel ?? "Kalorien pro Tag"}
      unit={props.unit ?? "kcal"}
    />
  );
}

describe("NutritionTrendChart", () => {
  it("renders one bar per bucket", () => {
    const { container } = renderChart();
    expect(container.querySelectorAll("rect")).toHaveLength(3);
  });

  it("colours over-target bars red and others forest", () => {
    const { container } = renderChart({
      buckets: [makeBucket("a", 1000), makeBucket("b", 3000)],
      target: 2000,
    });
    const rects = Array.from(container.querySelectorAll("rect"));
    expect(rects[0].getAttribute("class")).toContain("fill-forest");
    expect(rects[1].getAttribute("class")).toContain("fill-red-500");
  });

  it("draws the dashed target line only when a target is set", () => {
    const withTarget = renderChart({ target: 2000 });
    expect(withTarget.container.querySelector("line[stroke-dasharray]")).not.toBeNull();

    const withoutTarget = renderChart({ target: null });
    expect(withoutTarget.container.querySelector("line[stroke-dasharray]")).toBeNull();
  });

  it("exposes an accessible image role with the series label", () => {
    renderChart({ ariaLabel: "Protein pro Tag" });
    expect(screen.getByRole("img", { name: "Protein pro Tag" })).toBeInTheDocument();
  });

  it("renders nothing for an empty bucket list", () => {
    const { container } = renderChart({ buckets: [] });
    expect(container.querySelector("svg")).toBeNull();
  });
});
