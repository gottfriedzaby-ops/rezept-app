import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, SourceType } from "@/types/recipe";

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
`.trim();

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export async function parseRecipeFromImage(
  base64: string,
  mediaType: ImageMediaType,
  sourceValue: string
): Promise<ParsedRecipe> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
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

  const raw = block.text.trim().replace(/^```json\s*|```\s*$/g, "");
  return JSON.parse(raw) as ParsedRecipe;
}

export async function parseRecipeFromText(
  text: string,
  sourceType: SourceType,
  sourceValue: string
): Promise<ParsedRecipe> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Extract the recipe from the following text and return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\nRules:\n${RULES}\n- source.type must be "${sourceType}", source.value must be "${sourceValue}"\n\nText:\n${text.slice(0, 15000)}`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");

  const raw = block.text.trim().replace(/^```json\s*|```\s*$/g, "");
  return JSON.parse(raw) as ParsedRecipe;
}
