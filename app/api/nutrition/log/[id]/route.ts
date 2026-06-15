import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { LOG_MEAL_SLOTS, type LogMealSlot } from "@/types/nutrition";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if ("servings" in body) {
    const s = body.servings;
    if (typeof s !== "number" || !Number.isFinite(s) || s <= 0 || s > 100) {
      return NextResponse.json(
        { data: null, error: "Die Menge muss zwischen 0 und 100 Portionen liegen." },
        { status: 400 }
      );
    }
    update.servings = s;
  }
  if ("meal_slot" in body) {
    if (!LOG_MEAL_SLOTS.includes(body.meal_slot as LogMealSlot)) {
      return NextResponse.json({ data: null, error: "Ungültige Mahlzeit." }, { status: 400 });
    }
    update.meal_slot = body.meal_slot;
  }
  if ("label" in body) {
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 1 || label.length > 200) {
      return NextResponse.json(
        { data: null, error: "Der Name muss zwischen 1 und 200 Zeichen lang sein." },
        { status: 400 }
      );
    }
    update.label = label;
  }
  for (const field of ["kcal_per_serving", "protein_g", "carbs_g", "fat_g"] as const) {
    if (field in body) {
      const v = body[field];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { data: null, error: "Nährwerte müssen Zahlen ≥ 0 sein." },
          { status: 400 }
        );
      }
      update[field] = v;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ data: null, error: "Keine Felder zum Aktualisieren." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("food_log_entries")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("food_log_entries")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ data: null, error: "Nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({ data: null, error: null });
}
