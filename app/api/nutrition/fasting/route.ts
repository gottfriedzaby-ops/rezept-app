import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { FASTING_PRESETS, type FastingPresetId } from "@/lib/fasting";
import type { FastingSession, FastingState } from "@/types/fasting";

export const dynamic = "force-dynamic";

const RELATION_MISSING = "42P01";
const HISTORY_LIMIT = 30;
const PRESET_IDS: FastingPresetId[] = [...FASTING_PRESETS.map((p) => p.id), "custom"];

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("fasting_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(HISTORY_LIMIT + 1);

  if (error) {
    if (error.code === RELATION_MISSING) {
      // Migration not applied yet — render an empty state instead of crashing.
      return NextResponse.json({ data: { active: null, history: [] }, error: null });
    }
    console.error("[api/nutrition/fasting] GET failed:", error.message);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  const sessions = (data ?? []) as FastingSession[];
  const active = sessions.find((s) => s.ended_at === null) ?? null;
  const history = sessions.filter((s) => s.ended_at !== null).slice(0, HISTORY_LIMIT);
  const payload: FastingState = { active, history };
  return NextResponse.json({ data: payload, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const preset: string = typeof body.preset === "string" ? body.preset : "";
  const targetHours: unknown = body.target_hours;

  if (!PRESET_IDS.includes(preset as FastingPresetId)) {
    return NextResponse.json({ data: null, error: "Ungültiges Fasten-Programm." }, { status: 400 });
  }
  if (
    typeof targetHours !== "number" ||
    !Number.isFinite(targetHours) ||
    targetHours < 1 ||
    targetHours > 48
  ) {
    return NextResponse.json(
      { data: null, error: "Die Fastendauer muss zwischen 1 und 48 Stunden liegen." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("fasting_sessions")
    .insert({ user_id: user.id, preset, target_hours: targetHours })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { data: null, error: "Es läuft bereits ein Fasten. Beende es zuerst." },
        { status: 409 }
      );
    }
    if (error.code === RELATION_MISSING) {
      return NextResponse.json(
        { data: null, error: "Der Fasten-Tracker ist noch nicht eingerichtet.", code: RELATION_MISSING },
        { status: 503 }
      );
    }
    console.error("[api/nutrition/fasting] POST failed:", error.message);
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, error: null }, { status: 201 });
}
