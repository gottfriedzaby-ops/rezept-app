import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, SourceType } from "@/types/recipe";
import { normalizeTags } from "@/lib/tags";

const client = new Anthropic();

const RECIPE_SCHEMA = `{
  "title": "string",
  "servings": number,
  "prepTime": number (minutes),
  "cookTime": number (minutes),
  "ingredients": [{ "amount": number, "unit": "string", "name": "string" }],
  "steps": [{ "order": number, "text": "string", "timerSeconds": number | null }],
  "tags": ["string"],
  "source": { "type": "url" | "photo" | "youtube" | "manual", "value": "string" }
}`;

const RULES = `
- Return ONLY valid JSON — no markdown fences, no extra text
- Translate ALL text fields (title, ingredient names, step texts, tags) into German, regardless of the source language
- Convert ALL measurements to metric units: g for grams, kg for kilograms, ml for millilitres, l for litres, cm for centimetres (convert cups, ounces, pounds, inches, Fahrenheit → Celsius accordingly)
- Store each ingredient's amount per 1 serving: divide the total amount by the recipe's serving count (e.g. recipe serves 4, needs 400 g flour → store amount as 100)
- timerSeconds: null if the step has no specific time, otherwise the duration in seconds
- If a numeric field is unknown use 0; infer tags from ingredients and title
- tags: always lowercase German (e.g. "vegetarisch", "italienisch", "schnell") — never English, never capitalised
`.trim();

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in Claude response");
  return raw.slice(start, end + 1);
}


const REVIEW_SYSTEM = `
You are a professional recipe editor. You will receive a parsed recipe as JSON and must review and improve it.
Return ONLY the improved recipe as valid JSON in the exact same schema — no markdown fences, no extra text.

Review checklist:
1. Ingredients completeness: every ingredient mentioned in steps must appear in the ingredients list and vice versa. Add missing ones; remove unused ones.
2. Realistic amounts: amounts are stored per 1 serving — verify they are plausible for a single portion. Correct obvious errors (e.g. 500 g salt per serving is wrong).
3. Step quality: steps must be in logical cooking order, clearly written, and include temperatures in °C and timerSeconds wherever a recipe would normally specify them.
4. Metric units: convert any non-metric measurements (cups, oz, lbs, °F, inches) to metric.
5. German language: every text field — title, ingredient names, step texts, tags — must be in German.
6. Tags: provide accurate, useful tags covering cuisine type, meal type (Frühstück, Mittagessen, Abendessen, Dessert, Snack, Beilage), dietary info (vegetarisch, vegan, glutenfrei, laktosefrei), and difficulty (einfach, mittel, aufwändig). Use lowercase German.
`.trim();

export async function reviewAndImproveRecipe(recipe: ParsedRecipe): Promise<ParsedRecipe> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: REVIEW_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Review and improve this recipe. Return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\nRecipe to review:\n${JSON.stringify(recipe, null, 2)}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");

  const improved = JSON.parse(extractJson(block.text)) as ParsedRecipe;
  improved.source = recipe.source;
  improved.tags = normalizeTags(improved.tags);
  return improved;
}

export async function parseRecipeFromImage(
  base64: string,
  mediaType: ImageMediaType,
  sourceValue: string
): Promise<ParsedRecipe> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Read all recipe text visible in this image and extract the recipe. Return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\nRules:\n${RULES}\n- source.type must be "photo", source.value must be "${sourceValue}"`,
          },
        ],
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");

  const parsed = JSON.parse(extractJson(block.text)) as ParsedRecipe;
  parsed.tags = normalizeTags(parsed.tags);
  return parsed;
}

export async function parseRecipeFromText(
  text: string,
  sourceType: SourceType,
  sourceValue: string
): Promise<ParsedRecipe> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Extract the recipe from the following text and return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\nRules:\n${RULES}\n- source.type must be "${sourceType}", source.value must be "${sourceValue}"\n\nText:\n${text.slice(0, 15000)}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");

  const parsed = JSON.parse(extractJson(block.text)) as ParsedRecipe;
  parsed.tags = normalizeTags(parsed.tags);
  return parsed;
}
