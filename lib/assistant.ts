import { claudeCreate, parseClaudeJson } from "@/lib/claude";
import type { MealSlot } from "@/types/meal-plan";
import type { Ingredient, RecipeSection, RecipeType } from "@/types/recipe";

// AI cooking assistant (Feature 18). Three call sites on top of the shared
// claudeCreate wrapper (token logging → claude_api_calls → admin dashboard
// + assistant rate limit). Model tiers follow the project convention:
// claude-sonnet-4-6 for reasoning over the whole library, claude-haiku-4-5
// for short contextual answers.

/** Compact recipe representation sent to Claude — keep the prompt small. */
export interface AssistantRecipeSummary {
  id: string;
  title: string;
  tags: string[];
  recipe_type: RecipeType | null;
  total_time: number;
  ingredients: string[];
}

const MAX_RECIPES_IN_PROMPT = 300;
const MAX_INGREDIENTS_PER_RECIPE = 15;

export function toAssistantSummary(recipe: {
  id: string;
  title: string;
  tags: string[] | null;
  recipe_type: RecipeType | null;
  prep_time: number | null;
  cook_time: number | null;
  ingredients: Ingredient[] | null;
  sections: RecipeSection[] | null;
}): AssistantRecipeSummary {
  const flat =
    recipe.sections && recipe.sections.length > 0
      ? recipe.sections.flatMap((s) => s.ingredients)
      : recipe.ingredients ?? [];
  return {
    id: recipe.id,
    title: recipe.title,
    tags: recipe.tags ?? [],
    recipe_type: recipe.recipe_type,
    total_time: (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0),
    ingredients: flat.map((i) => i.name).slice(0, MAX_INGREDIENTS_PER_RECIPE),
  };
}

function recipesAsPromptLines(recipes: AssistantRecipeSummary[]): string {
  return recipes
    .slice(0, MAX_RECIPES_IN_PROMPT)
    .map(
      (r) =>
        `${r.id} | ${r.title} | ${r.recipe_type ?? "kochen"} | ${r.total_time} Min. | ` +
        `Tags: ${r.tags.join(", ") || "-"} | Zutaten: ${r.ingredients.join(", ") || "-"}`
    )
    .join("\n");
}

// ─── „Was kann ich kochen?" ──────────────────────────────────────────────────

export interface PantrySuggestion {
  recipe_id: string;
  reason: string;
  missing: string[];
}

interface RawPantrySuggestion {
  recipe_id?: unknown;
  reason?: unknown;
  missing?: unknown;
}

export async function suggestRecipesFromPantry(
  pantryText: string,
  recipes: AssistantRecipeSummary[],
  userId: string | null = null,
): Promise<PantrySuggestion[]> {
  if (recipes.length === 0) return [];
  const validIds = new Set(recipes.map((r) => r.id));

  const prompt =
    `Du bist ein Kochassistent. Der Nutzer beschreibt, was er zu Hause hat. ` +
    `Wähle aus seiner Rezeptbibliothek die maximal 5 am besten passenden Rezepte.\n\n` +
    `Vorräte des Nutzers:\n"""${pantryText.slice(0, 1000)}"""\n\n` +
    `Rezeptbibliothek (id | Titel | Typ | Gesamtzeit | Tags | Zutaten):\n` +
    `${recipesAsPromptLines(recipes)}\n\n` +
    `Regeln:\n` +
    `- Bevorzuge Rezepte, deren Hauptzutaten der Nutzer bereits hat.\n` +
    `- "reason": 1 kurzer deutscher Satz, warum das Rezept passt.\n` +
    `- "missing": wichtige fehlende Zutaten (max 5, deutsche Namen wie im Rezept); Grundzutaten wie Salz, Pfeffer, Öl, Wasser nie auflisten.\n` +
    `- Nutze NUR ids aus der Bibliothek. Wenn nichts passt, gib [] zurück.\n\n` +
    `Return ONLY valid JSON (no markdown fences, no extra text):\n` +
    `[{"recipe_id":"...","reason":"...","missing":["..."]}]`;

  const { message } = await claudeCreate(
    "suggestRecipesFromPantry",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    },
    userId,
  );

  const block = message.content[0];
  if (block?.type !== "text") return [];

  const raw = parseClaudeJson<RawPantrySuggestion[]>(block.text);
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const suggestions: PantrySuggestion[] = [];
  for (const item of raw) {
    if (
      typeof item?.recipe_id !== "string" ||
      !validIds.has(item.recipe_id) ||
      seen.has(item.recipe_id)
    ) {
      continue;
    }
    seen.add(item.recipe_id);
    suggestions.push({
      recipe_id: item.recipe_id,
      reason: typeof item.reason === "string" ? item.reason.slice(0, 300) : "",
      missing: Array.isArray(item.missing)
        ? item.missing
            .filter((m): m is string => typeof m === "string" && m.length > 0)
            .slice(0, 5)
        : [],
    });
    if (suggestions.length >= 5) break;
  }
  return suggestions;
}

// ─── Wochenplan-Vorschlag ────────────────────────────────────────────────────

export interface OpenSlot {
  date: string;
  meal_slot: MealSlot;
}

export interface WeekPlanSuggestion {
  date: string;
  meal_slot: MealSlot;
  recipe_id: string;
}

interface RawWeekPlanSuggestion {
  date?: unknown;
  meal_slot?: unknown;
  recipe_id?: unknown;
}

export async function suggestWeekPlan(
  args: {
    openSlots: OpenSlot[];
    recipes: AssistantRecipeSummary[];
    recentRecipeIds: string[];
  },
  userId: string | null = null,
): Promise<WeekPlanSuggestion[]> {
  const { openSlots, recipes, recentRecipeIds } = args;
  if (openSlots.length === 0 || recipes.length === 0) return [];

  const validIds = new Set(recipes.map((r) => r.id));
  const slotKey = (s: OpenSlot) => `${s.date}|${s.meal_slot}`;
  const openSlotKeys = new Set(openSlots.map(slotKey));

  const prompt =
    `Du bist ein Kochassistent und planst eine Woche. Fülle die unten genannten freien ` +
    `Mahlzeiten-Slots mit passenden Rezepten aus der Bibliothek des Nutzers.\n\n` +
    `Freie Slots (Datum | Mahlzeit):\n` +
    `${openSlots.map((s) => `${s.date} | ${s.meal_slot}`).join("\n")}\n\n` +
    `Rezeptbibliothek (id | Titel | Typ | Gesamtzeit | Tags | Zutaten):\n` +
    `${recipesAsPromptLines(recipes)}\n\n` +
    (recentRecipeIds.length > 0
      ? `Kürzlich geplant oder gekocht (möglichst NICHT wiederholen):\n${recentRecipeIds
          .slice(0, 40)
          .join(", ")}\n\n`
      : "") +
    `Regeln:\n` +
    `- Pro Slot genau ein Rezept; jedes Rezept höchstens einmal in der Woche.\n` +
    `- Sorge für Abwechslung (Rezepttypen, Hauptzutaten, Tags).\n` +
    `- Frühstücks-Slots (fruehstueck) nur mit frühstückstauglichen Rezepten füllen; ` +
    `lass einen Slot weg, wenn nichts passt.\n` +
    `- Nutze NUR ids aus der Bibliothek und NUR die genannten Slots.\n\n` +
    `Return ONLY valid JSON (no markdown fences, no extra text):\n` +
    `[{"date":"YYYY-MM-DD","meal_slot":"fruehstueck|mittag|abend","recipe_id":"..."}]`;

  const { message } = await claudeCreate(
    "suggestWeekPlan",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    },
    userId,
  );

  const block = message.content[0];
  if (block?.type !== "text") return [];

  const raw = parseClaudeJson<RawWeekPlanSuggestion[]>(block.text);
  if (!Array.isArray(raw)) return [];

  const usedSlots = new Set<string>();
  const usedRecipes = new Set<string>();
  const suggestions: WeekPlanSuggestion[] = [];
  for (const item of raw) {
    if (
      typeof item?.date !== "string" ||
      typeof item?.meal_slot !== "string" ||
      typeof item?.recipe_id !== "string"
    ) {
      continue;
    }
    const key = `${item.date}|${item.meal_slot}`;
    if (
      !openSlotKeys.has(key) ||
      usedSlots.has(key) ||
      !validIds.has(item.recipe_id) ||
      usedRecipes.has(item.recipe_id)
    ) {
      continue;
    }
    usedSlots.add(key);
    usedRecipes.add(item.recipe_id);
    suggestions.push({
      date: item.date,
      meal_slot: item.meal_slot as MealSlot,
      recipe_id: item.recipe_id,
    });
  }
  return suggestions;
}

// ─── Koch-Fragen im Kochmodus ────────────────────────────────────────────────

export interface CookingQuestionContext {
  title: string;
  servings: number;
  sections: RecipeSection[];
  currentStepText: string | null;
  question: string;
}

export async function answerCookingQuestion(
  context: CookingQuestionContext,
  userId: string | null = null,
): Promise<string | null> {
  const ingredientLines = context.sections
    .flatMap((s) => s.ingredients)
    .map((i) =>
      i.amount > 0 ? `- ${i.amount} ${i.unit} ${i.name}` : `- ${i.unit} ${i.name}`.trim()
    )
    .join("\n");
  const stepLines = context.sections
    .flatMap((s) => s.steps)
    .map((s) => `${s.order}. ${s.text}`)
    .join("\n");

  const prompt =
    `Du hilfst beim Kochen des folgenden Rezepts. Beantworte die Frage kurz, ` +
    `praktisch und auf Deutsch (maximal 4 Sätze, kein Markdown). ` +
    `Beziehe dich auf das Rezept; bei Fragen ohne Bezug zum Kochen antworte, ` +
    `dass du nur beim Rezept helfen kannst.\n\n` +
    `Rezept: ${context.title} (Zutaten pro Portion, geplant: ${context.servings} Portionen)\n\n` +
    `Zutaten (pro Portion):\n${ingredientLines}\n\n` +
    `Schritte:\n${stepLines}\n\n` +
    (context.currentStepText ? `Aktueller Schritt: ${context.currentStepText}\n\n` : "") +
    `Frage: ${context.question.slice(0, 500)}`;

  const { message } = await claudeCreate(
    "answerCookingQuestion",
    {
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    },
    userId,
  );

  const block = message.content[0];
  if (block?.type !== "text") return null;
  const answer = block.text.trim();
  return answer.length > 0 ? answer : null;
}
