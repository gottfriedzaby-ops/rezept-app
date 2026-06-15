import { render, screen } from "@testing-library/react";
import NutritionDashboard from "@/components/nutrition/NutritionDashboard";
import { ToastProvider } from "@/contexts/ToastContext";
import type { FoodLogEntry, NutritionProfile } from "@/types/nutrition";

const TODAY = "2026-06-15";

function makeProfile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    user_id: "user-1",
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    sex: "female",
    birth_date: "1996-03-15",
    height_cm: 165,
    weight_kg: 60,
    activity_level: "moderate",
    goal: "maintain",
    target_kcal: 2000,
    target_protein_g: 100,
    target_carbs_g: 250,
    target_fat_g: 70,
    manual_targets: false,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: "entry-1",
    created_at: "2026-06-15T08:00:00Z",
    user_id: "user-1",
    recipe_id: null,
    date: TODAY,
    meal_slot: "mittag",
    source: "manual",
    label: "Apfel",
    servings: 1,
    kcal_per_serving: 500,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 5,
    ...overrides,
  };
}

function renderDashboard(props: Partial<React.ComponentProps<typeof NutritionDashboard>> = {}) {
  return render(
    <ToastProvider>
      <NutritionDashboard
        date={props.date ?? TODAY}
        todayIso={TODAY}
        profile={"profile" in props ? props.profile ?? null : makeProfile()}
        entries={props.entries ?? []}
        recipes={props.recipes ?? []}
      />
    </ToastProvider>
  );
}

describe("NutritionDashboard", () => {
  it("shows the onboarding form when no profile exists", () => {
    renderDashboard({ profile: null });
    expect(screen.getByText("Richte dein Ernährungsziel ein")).toBeInTheDocument();
    // The goal form renders a sex selector
    expect(screen.getByText("Weiblich")).toBeInTheDocument();
  });

  it("renders the four meal slots and the remaining-calorie figure", () => {
    renderDashboard({ entries: [makeEntry()] });

    expect(screen.getByText("Frühstück")).toBeInTheDocument();
    expect(screen.getByText("Mittag")).toBeInTheDocument();
    expect(screen.getByText("Abend")).toBeInTheDocument();
    expect(screen.getByText("Snacks")).toBeInTheDocument();

    // 2000 target − 500 consumed = 1500 remaining (shown in the ring centre)
    expect(screen.getByText("1500")).toBeInTheDocument();
    // The logged entry label is visible
    expect(screen.getByText("Apfel")).toBeInTheDocument();
  });

  it("shows today's label for the current date", () => {
    renderDashboard();
    expect(screen.getAllByText("Heute").length).toBeGreaterThan(0);
  });
});
