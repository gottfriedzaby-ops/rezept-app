import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidIsoDate } from "@/lib/meal-plan";
import {
  ACTIVITY_MULTIPLIERS,
  computeAge,
  computeTargets,
  type ActivityLevel,
  type Goal,
  type Sex,
} from "@/lib/nutrition-goals";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const TABLE_MISSING_MESSAGE = "Ernährungsprofil ist noch nicht eingerichtet.";

const SEXES: Sex[] = ["male", "female", "diverse"];
const GOALS: Goal[] = ["lose", "maintain", "gain"];
const ACTIVITY_LEVELS = Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[];

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("nutrition_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (error.code === RELATION_MISSING) {
      // Migration not applied yet — treat as "no profile" rather than crashing.
      return NextResponse.json({ data: null, error: null });
    }
    console.error("[api/nutrition/profile] GET failed:", error.message);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? null, error: null });
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export async function PUT(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const sex = body.sex as unknown;
  const birthDate = body.birth_date as unknown;
  const heightCm = body.height_cm as unknown;
  const weightKg = body.weight_kg as unknown;
  const activityLevel = body.activity_level as unknown;
  const goal = body.goal as unknown;

  if (typeof sex !== "string" || !SEXES.includes(sex as Sex)) {
    return NextResponse.json({ data: null, error: "Ungültiges Geschlecht." }, { status: 400 });
  }
  if (typeof birthDate !== "string" || !isValidIsoDate(birthDate)) {
    return NextResponse.json({ data: null, error: "Ungültiges Geburtsdatum." }, { status: 400 });
  }
  const age = computeAge(birthDate);
  if (age < 13 || age > 120) {
    return NextResponse.json(
      { data: null, error: "Das Alter muss zwischen 13 und 120 Jahren liegen." },
      { status: 400 }
    );
  }
  if (!isNumberInRange(heightCm, 50, 280)) {
    return NextResponse.json(
      { data: null, error: "Die Größe muss zwischen 50 und 280 cm liegen." },
      { status: 400 }
    );
  }
  if (!isNumberInRange(weightKg, 20, 500)) {
    return NextResponse.json(
      { data: null, error: "Das Gewicht muss zwischen 20 und 500 kg liegen." },
      { status: 400 }
    );
  }
  if (typeof activityLevel !== "string" || !ACTIVITY_LEVELS.includes(activityLevel as ActivityLevel)) {
    return NextResponse.json({ data: null, error: "Ungültiges Aktivitätslevel." }, { status: 400 });
  }
  if (typeof goal !== "string" || !GOALS.includes(goal as Goal)) {
    return NextResponse.json({ data: null, error: "Ungültiges Ziel." }, { status: 400 });
  }

  const profileInput = {
    sex: sex as Sex,
    birth_date: birthDate,
    height_cm: heightCm,
    weight_kg: weightKg,
    activity_level: activityLevel as ActivityLevel,
    goal: goal as Goal,
  };

  const manualTargets = body.manual_targets === true;
  let targets;
  if (manualTargets) {
    const { target_kcal, target_protein_g, target_carbs_g, target_fat_g } = body;
    if (
      !isNumberInRange(target_kcal, 0, 20000) ||
      !isNumberInRange(target_protein_g, 0, 2000) ||
      !isNumberInRange(target_carbs_g, 0, 2000) ||
      !isNumberInRange(target_fat_g, 0, 2000)
    ) {
      return NextResponse.json(
        { data: null, error: "Ungültige Zielwerte." },
        { status: 400 }
      );
    }
    targets = {
      target_kcal: Math.round(target_kcal),
      target_protein_g: Math.round(target_protein_g),
      target_carbs_g: Math.round(target_carbs_g),
      target_fat_g: Math.round(target_fat_g),
    };
  } else {
    targets = computeTargets(profileInput);
  }

  const { data, error } = await supabaseAdmin
    .from("nutrition_profiles")
    .upsert(
      {
        user_id: user.id,
        ...profileInput,
        ...targets,
        manual_targets: manualTargets,
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    if (error.code === RELATION_MISSING) {
      return NextResponse.json(
        { data: null, error: TABLE_MISSING_MESSAGE, code: RELATION_MISSING },
        { status: 503 }
      );
    }
    console.error("[api/nutrition/profile] PUT failed:", error.message);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null });
}
