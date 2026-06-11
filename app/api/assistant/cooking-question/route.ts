import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  checkDailyAssistantLimit,
  assistantRateLimitErrorMessage,
} from "@/lib/assistant-rate-limit";
import { answerCookingQuestion } from "@/lib/assistant";
import { getRecipeSections } from "@/types/recipe";
import type { Recipe } from "@/types/recipe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Short contextual answers while cooking ("Kann ich Quark statt Sahne
// nehmen?"). Own recipes only (CookMode is reached from the own library).
export async function POST(request: NextRequest) {
  const limit = await checkDailyAssistantLimit();
  if (!limit.userId) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { data: null, error: assistantRateLimitErrorMessage(limit) },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const recipeId: string = typeof body.recipe_id === "string" ? body.recipe_id : "";
  const question: string = typeof body.question === "string" ? body.question.trim() : "";
  const stepIndex: number | null =
    typeof body.step_index === "number" && Number.isInteger(body.step_index)
      ? body.step_index
      : null;
  const servings: number =
    typeof body.servings === "number" && body.servings >= 1 && body.servings <= 20
      ? body.servings
      : 1;

  if (!recipeId) {
    return NextResponse.json({ data: null, error: "recipe_id ist erforderlich." }, { status: 400 });
  }
  if (question.length < 3 || question.length > 500) {
    return NextResponse.json(
      { data: null, error: "Bitte stelle eine Frage (3–500 Zeichen)." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("*")
    .eq("id", recipeId)
    .eq("user_id", limit.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ data: null, error: "Rezept nicht gefunden" }, { status: 404 });
  }

  const recipe = data as Recipe;
  const sections = getRecipeSections(recipe);
  const allSteps = sections.flatMap((s) => s.steps);
  const currentStepText =
    stepIndex !== null && stepIndex >= 0 && stepIndex < allSteps.length
      ? allSteps[stepIndex].text
      : null;

  try {
    const answer = await answerCookingQuestion(
      {
        title: recipe.title,
        servings,
        sections,
        currentStepText,
        question,
      },
      limit.userId,
    );

    if (!answer) {
      return NextResponse.json(
        { data: null, error: "Keine Antwort erhalten. Bitte versuche es erneut." },
        { status: 502 }
      );
    }
    return NextResponse.json({ data: { answer }, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: "Der Assistent ist gerade nicht erreichbar. Bitte versuche es erneut." },
      { status: 502 }
    );
  }
}
