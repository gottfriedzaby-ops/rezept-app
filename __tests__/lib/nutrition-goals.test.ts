import {
  computeAge,
  computeBmr,
  computeTargets,
  computeTdee,
  type NutritionProfileInput,
} from "@/lib/nutrition-goals";

const FEMALE: NutritionProfileInput = {
  sex: "female",
  birth_date: "1996-03-15",
  height_cm: 165,
  weight_kg: 60,
  activity_level: "moderate",
  goal: "maintain",
};

describe("computeAge", () => {
  it("returns whole years when the birthday has passed this year", () => {
    expect(computeAge("1996-03-15", new Date("2026-06-15T00:00:00Z"))).toBe(30);
  });

  it("subtracts a year when the birthday has not yet occurred", () => {
    expect(computeAge("1996-08-15", new Date("2026-06-15T00:00:00Z"))).toBe(29);
  });

  it("handles the birthday being today (counts as having occurred)", () => {
    expect(computeAge("2000-06-15", new Date("2026-06-15T00:00:00Z"))).toBe(26);
  });
});

describe("computeBmr (Mifflin-St Jeor)", () => {
  const now = new Date("2026-03-15T00:00:00Z"); // exactly 30 for FEMALE

  it("applies the female constant (−161)", () => {
    // 10*60 + 6.25*165 − 5*30 − 161 = 1320.25
    expect(computeBmr(FEMALE, now)).toBeCloseTo(1320.25, 2);
  });

  it("applies the male constant (+5)", () => {
    const male: NutritionProfileInput = {
      ...FEMALE,
      sex: "male",
      height_cm: 180,
      weight_kg: 80,
    };
    // 10*80 + 6.25*180 − 5*30 + 5 = 1780
    expect(computeBmr(male, now)).toBeCloseTo(1780, 2);
  });

  it("averages the constant for diverse (−78)", () => {
    const diverse: NutritionProfileInput = { ...FEMALE, sex: "diverse" };
    // 10*60 + 6.25*165 − 5*30 − 78 = 1403.25
    expect(computeBmr(diverse, now)).toBeCloseTo(1403.25, 2);
  });
});

describe("computeTdee", () => {
  it("multiplies BMR by the activity factor", () => {
    const now = new Date("2026-03-15T00:00:00Z");
    // 1320.25 * 1.55
    expect(computeTdee(FEMALE, now)).toBeCloseTo(2046.3875, 3);
  });
});

describe("computeTargets", () => {
  const now = new Date("2026-03-15T00:00:00Z");

  it("computes a maintain budget and a macro split summing back to ~kcal", () => {
    const t = computeTargets(FEMALE, now);
    expect(t.target_kcal).toBe(2046);
    expect(t.target_protein_g).toBe(102); // 2046*0.2/4
    expect(t.target_carbs_g).toBe(256); // 2046*0.5/4
    expect(t.target_fat_g).toBe(68); // 2046*0.3/9

    const kcalFromMacros =
      t.target_protein_g * 4 + t.target_carbs_g * 4 + t.target_fat_g * 9;
    expect(Math.abs(kcalFromMacros - t.target_kcal)).toBeLessThan(20);
  });

  it("subtracts 500 kcal for a lose goal", () => {
    const lose = computeTargets({ ...FEMALE, goal: "lose" }, now);
    expect(lose.target_kcal).toBe(2046 - 500);
  });

  it("adds 400 kcal for a gain goal", () => {
    const gain = computeTargets({ ...FEMALE, goal: "gain" }, now);
    expect(gain.target_kcal).toBe(2046 + 400);
  });

  it("never drops below the safety floor for an aggressive deficit", () => {
    const tiny: NutritionProfileInput = {
      sex: "female",
      birth_date: "1956-01-01",
      height_cm: 150,
      weight_kg: 45,
      activity_level: "sedentary",
      goal: "lose",
    };
    // TDEE ≈ 1052, minus 500 ≈ 552, floored to 1200 for female
    expect(computeTargets(tiny, now).target_kcal).toBe(1200);
  });
});
