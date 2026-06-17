import { claudeCreate, parseClaudeJson } from "@/lib/claude";
import type { RecipeType } from "@/types/recipe";

/**
 * Hybrid-Erweiterung der Smart-Collections (Feature 20): ein optionaler,
 * nutzerausgelöster Claude-Durchlauf, der *thematische* Sammlungen jenseits der
 * kanonischen Kategorien vorschlägt (z. B. „Mediterrane Sommerküche"). Läuft
 * über den geteilten `claudeCreate`-Wrapper (Token-Logging + Tageslimit) und
 * folgt dem Muster aus `lib/assistant.ts`.
 */

export interface ThematicRecipeInput {
  id: string;
  title: string;
  tags: string[];
  recipe_type: RecipeType | null;
}

export interface ThematicCollectionSuggestion {
  name: string;
  recipeIds: string[];
}

interface RawThematicSuggestion {
  name?: unknown;
  recipe_ids?: unknown;
}

const MAX_RECIPES_IN_PROMPT = 250;
const MAX_SUGGESTIONS = 4;
const MIN_RECIPES_PER_SUGGESTION = 3;

function recipesAsPromptLines(recipes: ThematicRecipeInput[]): string {
  return recipes
    .slice(0, MAX_RECIPES_IN_PROMPT)
    .map(
      (r) =>
        `${r.id} | ${r.title} | ${r.recipe_type ?? "kochen"} | Tags: ${
          r.tags.join(", ") || "-"
        }`
    )
    .join("\n");
}

/**
 * Schlägt thematische Sammlungen vor, die NICHT in der kanonischen Liste
 * stehen und keine bestehende Sammlung doppeln. Validiert serverseitig, dass
 * alle zurückgegebenen IDs zur Bibliothek gehören.
 */
export async function suggestThematicCollections(
  recipes: ThematicRecipeInput[],
  existingNames: string[],
  userId: string | null = null
): Promise<ThematicCollectionSuggestion[]> {
  if (recipes.length < MIN_RECIPES_PER_SUGGESTION) return [];
  const validIds = new Set(recipes.map((r) => r.id));

  const prompt =
    `Du hilfst dabei, eine Rezeptbibliothek in sinnvolle Sammlungen zu sortieren. ` +
    `Schlage bis zu ${MAX_SUGGESTIONS} *thematische* Sammlungen vor, die zur Bibliothek passen.\n\n` +
    `Bereits abgedeckte Standard-Kategorien (NICHT erneut vorschlagen): Getränke & Cocktails, ` +
    `Desserts & Süßes, Backen, Suppen & Eintöpfe, Salate, Grillen & BBQ, Frühstück, Pasta & Nudeln, ` +
    `Fleischgerichte, Fisch & Meeresfrüchte, Vegetarisch, Schnelle Küche.\n` +
    (existingNames.length > 0
      ? `Bereits vorhandene Sammlungen des Nutzers (NICHT doppeln): ${existingNames
          .slice(0, 50)
          .join(", ")}\n`
      : "") +
    `\nFinde stattdessen feinere Themen wie Küchenstil/Region, Anlass oder Zutaten-Schwerpunkt ` +
    `(z. B. „Mediterrane Sommerküche", „One-Pot-Gerichte", „Asiatische Küche").\n\n` +
    `Rezeptbibliothek (id | Titel | Typ | Tags):\n${recipesAsPromptLines(recipes)}\n\n` +
    `Regeln:\n` +
    `- "name": kurzer, sprechender deutscher Sammlungsname (max. 60 Zeichen).\n` +
    `- "recipe_ids": mindestens ${MIN_RECIPES_PER_SUGGESTION} passende ids aus der Bibliothek.\n` +
    `- Nutze NUR ids aus der Bibliothek. Wenn nichts Sinnvolles übrig bleibt, gib [] zurück.\n\n` +
    `Return ONLY valid JSON (no markdown fences, no extra text):\n` +
    `[{"name":"...","recipe_ids":["..."]}]`;

  const { message } = await claudeCreate(
    "suggestThematicCollections",
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    },
    userId
  );

  const block = message.content[0];
  if (block?.type !== "text") return [];

  const raw = parseClaudeJson<RawThematicSuggestion[]>(block.text);
  if (!Array.isArray(raw)) return [];

  const seenNames = new Set<string>();
  const suggestions: ThematicCollectionSuggestion[] = [];
  for (const item of raw) {
    if (typeof item?.name !== "string") continue;
    const name = item.name.trim().slice(0, 100);
    const lowerName = name.toLowerCase();
    if (name.length === 0 || seenNames.has(lowerName)) continue;

    const recipeIds = Array.isArray(item.recipe_ids)
      ? Array.from(
          new Set(
            item.recipe_ids.filter(
              (id): id is string => typeof id === "string" && validIds.has(id)
            )
          )
        )
      : [];
    if (recipeIds.length < MIN_RECIPES_PER_SUGGESTION) continue;

    seenNames.add(lowerName);
    suggestions.push({ name, recipeIds });
    if (suggestions.length >= MAX_SUGGESTIONS) break;
  }
  return suggestions;
}
