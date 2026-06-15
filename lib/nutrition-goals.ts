// Pure calorie/macro goal math (Feature 19). No I/O — directly unit-testable.
// Mifflin-St Jeor BMR → activity-adjusted TDEE → goal-adjusted daily kcal budget,
// then split into protein/carbs/fat grams. All values rounded to integers.

export type Sex = "male" | "female" | "diverse";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface NutritionProfileInput {
  sex: Sex;
  birth_date: string; // ISO date YYYY-MM-DD
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
}

export interface NutritionTargets {
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
}

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Sex constant in the Mifflin-St Jeor equation. `diverse` averages the binary
// constants (+5 and −161 → −78) so non-binary users still get a sensible budget.
const SEX_CONSTANT: Record<Sex, number> = {
  male: 5,
  female: -161,
  diverse: -78,
};

// Goal kcal adjustment relative to TDEE (≈0.5 kg/week deficit / lean surplus).
const GOAL_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 400,
};

// Safety floor so an aggressive deficit never produces an unhealthily low budget.
const KCAL_FLOOR: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  diverse: 1350,
};

// Default macro split as a share of total kcal (Yazio-like balanced default).
export const DEFAULT_MACRO_SPLIT = { carbs: 0.5, fat: 0.3, protein: 0.2 } as const;

const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

/** Whole years between birthDate and `now` (default: today). */
export function computeAge(birthDate: string, now: Date = new Date()): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - year;
  const monthDiff = now.getUTCMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < day)) {
    age -= 1;
  }
  return age;
}

/** Basal metabolic rate (kcal/day) via Mifflin-St Jeor. */
export function computeBmr(input: NutritionProfileInput, now: Date = new Date()): number {
  const age = computeAge(input.birth_date, now);
  return (
    10 * input.weight_kg +
    6.25 * input.height_cm -
    5 * age +
    SEX_CONSTANT[input.sex]
  );
}

/** Total daily energy expenditure (kcal/day) = BMR × activity multiplier. */
export function computeTdee(input: NutritionProfileInput, now: Date = new Date()): number {
  return computeBmr(input, now) * ACTIVITY_MULTIPLIERS[input.activity_level];
}

/**
 * Daily calorie + macro budget for the given body profile and goal.
 * The kcal budget is floored at a safe minimum per sex.
 */
export function computeTargets(
  input: NutritionProfileInput,
  now: Date = new Date()
): NutritionTargets {
  const tdee = computeTdee(input, now);
  const adjusted = tdee + GOAL_ADJUSTMENT[input.goal];
  const kcal = Math.round(Math.max(adjusted, KCAL_FLOOR[input.sex]));

  const target_protein_g = Math.round(
    (kcal * DEFAULT_MACRO_SPLIT.protein) / KCAL_PER_GRAM.protein
  );
  const target_carbs_g = Math.round(
    (kcal * DEFAULT_MACRO_SPLIT.carbs) / KCAL_PER_GRAM.carbs
  );
  const target_fat_g = Math.round(
    (kcal * DEFAULT_MACRO_SPLIT.fat) / KCAL_PER_GRAM.fat
  );

  return { target_kcal: kcal, target_protein_g, target_carbs_g, target_fat_g };
}
