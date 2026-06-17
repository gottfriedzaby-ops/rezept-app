import { render, screen, fireEvent } from "@testing-library/react";
import NutritionInsights from "@/components/nutrition/NutritionInsights";
import { ToastProvider } from "@/contexts/ToastContext";
import type {
  NutritionStatsResponse,
  StatsBucket,
  StatsSummary,
} from "@/lib/nutrition-stats";
import type { MacroTotals } from "@/types/nutrition";

function makeBuckets(n: number, loggedKcal?: { index: number; kcal: number }): StatsBucket[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `2026-06-${String(11 + i).padStart(2, "0")}`,
    kind: "daily" as const,
    totals: {
      kcal: loggedKcal && loggedKcal.index === i ? loggedKcal.kcal : 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    },
    daysLogged: loggedKcal && loggedKcal.index === i ? 1 : 0,
  }));
}

function makeSummary(o: Partial<StatsSummary> = {}): StatsSummary {
  return {
    range: "week",
    dateRange: { start: "2026-06-11", end: "2026-06-17", days: 7 },
    buckets: makeBuckets(7, { index: 2, kcal: 1850 }),
    averages: { kcal: 1850, protein_g: 95, carbs_g: 210, fat_g: 62 },
    daysLogged: 4,
    calendarDays: 7,
    adherence: 0.6,
    totalEntries: 9,
    ...o,
  };
}

function mockFetch(response: NutritionStatsResponse) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: response, error: null }),
  }) as unknown as typeof fetch;
}

function renderInsights(
  response: NutritionStatsResponse,
  onBackToDiary?: () => void
) {
  mockFetch(response);
  return render(
    <ToastProvider>
      <NutritionInsights onBackToDiary={onBackToDiary} />
    </ToastProvider>
  );
}

const TARGET: MacroTotals = { kcal: 2000, protein_g: 100, carbs_g: 250, fat_g: 70 };

afterEach(() => {
  jest.restoreAllMocks();
});

describe("NutritionInsights", () => {
  it("renders KPI cards and the chart once the range loads", async () => {
    renderInsights({ summary: makeSummary(), target: TARGET });

    expect(await screen.findByText("Ø Kalorien pro Tag")).toBeInTheDocument();
    expect(screen.getByText("Ø Makros pro Tag")).toBeInTheDocument();
    expect(screen.getByText("Erfasste Tage")).toBeInTheDocument();
    expect(screen.getByText(/% erfasst/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Kalorien pro Tag" })).toBeInTheDocument();
  });

  it("switches the charted metric without refetching", async () => {
    renderInsights({ summary: makeSummary(), target: TARGET });
    await screen.findByText("Ø Kalorien pro Tag");

    fireEvent.click(screen.getByRole("button", { name: "Protein" }));

    expect(screen.getByRole("img", { name: "Protein pro Tag" })).toBeInTheDocument();
    // Only the initial mount fetch — metric switching is pure client state.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state and triggers the back-to-diary callback", async () => {
    const onBack = jest.fn();
    renderInsights(
      {
        summary: makeSummary({
          buckets: makeBuckets(7),
          averages: null,
          daysLogged: 0,
          adherence: 0,
          totalEntries: 0,
        }),
        target: TARGET,
      },
      onBack
    );

    expect(await screen.findByText("Noch keine Einträge in diesem Zeitraum.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zum Tagebuch" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("omits the target line and slash when no target is set", async () => {
    const { container } = renderInsights({ summary: makeSummary(), target: null });
    await screen.findByText("Ø Kalorien pro Tag");

    expect(container.querySelector("line[stroke-dasharray]")).toBeNull();
    expect(screen.queryByText(/\/ 2000/)).toBeNull();
  });

  it("warns that more data is needed when only a day or two is logged", async () => {
    renderInsights({
      summary: makeSummary({ daysLogged: 1, totalEntries: 1 }),
      target: TARGET,
    });

    expect(
      await screen.findByText("Mehr Daten nötig, um aussagekräftige Trends zu zeigen.")
    ).toBeInTheDocument();
  });
});
