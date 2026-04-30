import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, RecipeSection, SourceType } from "@/types/recipe";
import { normalizeTags } from "@/lib/tags";

export interface JsonLdRecipeData {
  name?: string;
  recipeIngredient?: string[];
  recipeInstructions?: Array<string | { "@type"?: string; text?: string; name?: string }>;
  recipeYield?: string | number;
  prepTime?: string;
  cookTime?: string;
  image?: string | string[] | { url?: string };
}

const client = new Anthropic();

const RECIPE_SCHEMA = `{
  "title": "string",
  "recipe_type": "kochen | backen | grillen | zubereiten",
  "servings": number,
  "prepTime": number (minutes),
  "cookTime": number (minutes),
  "sections": [
    {
      "title": "string | null",
      "ingredients": [{ "amount": number, "unit": "string", "name": "string" }],
      "steps": [{ "order": number, "text": "string", "timerSeconds": number | null }]
    }
  ],
  "tags": ["string"],
  "scalable": boolean,
  "source": { "type": "url" | "photo" | "youtube" | "instagram" | "manual", "value": "string" }
}`;

const RULES = `
- Return ONLY valid JSON — no markdown fences, no extra text, no content after the closing brace
- All double-quote characters that appear inside JSON string values must be escaped as \" — never output raw unescaped " inside a string
- Translate ALL text fields (title, ingredient names, step texts, tags) into German, regardless of the source language
- Unicode fraction characters represent exact values: ½=0.5, ¼=0.25, ¾=0.75, ⅓≈0.333, ⅔≈0.667, ⅛=0.125 — apply these when they appear in amounts (e.g. "½ gram" = 0.5 g, "¼ tsp" = 0.25 tsp)
- Convert ALL measurements to metric units: g for grams, kg for kilograms, ml for millilitres, l for litres, cm for centimetres (convert cups, ounces, pounds, inches, Fahrenheit → Celsius accordingly). HIGHEST PRIORITY EXCEPTION: when the source provides an explicit metric value alongside a non-metric one — whether in parentheses like "2 tsp (10 g)", as a fraction like "(½ gram)", or any other form — use ONLY the stated metric value; do NOT independently convert the non-metric unit
- German cooking abbreviations: EL (Esslöffel) = 15 ml, TL (Teelöffel) = 5 ml, Prise = 0.5 g — apply these conversions whenever they appear in ingredient amounts
- Store ingredient amounts as the TOTAL quantity for the complete recipe as written — do NOT divide by serving count (e.g. recipe serves 4, needs 400 g flour → store 400, not 100). If the source lists amounts "per serving" or "for 1 person", multiply each amount by the total number of servings before storing. Never output per-serving amounts — always total amounts for all servings combined
- The "servings" field must reflect the recipe's actual yield (number of portions the total amounts produce)
- scalable: set to false when the recipe requires a whole indivisible unit that cannot reasonably be prepared in a smaller fraction (e.g. a whole roast, whole fish, a full cake baked as one). Set to true for all other recipes (pasta, pizza, soups, doughs, etc.)
- timerSeconds: null if the step has no specific time, otherwise the duration in seconds
- If a numeric field is unknown use 0; infer tags from ingredients and title
- tags: always lowercase German (e.g. "vegetarisch", "italienisch", "schnell") — never English, never capitalised
- recipe_type: classify as "backen" for oven-baked goods requiring precise temperature/timing (bread, cakes, cookies, quiche), "grillen" for open-flame or griddle cooking (BBQ, Grillgemüse), "zubereiten" for no-heat assembly recipes (salads, smoothies, overnight oats, sandwiches), "kochen" for everything else. Default to "kochen" when uncertain
- sections: if the recipe has distinct named components (e.g. "Für die Soße", "Für den Teig", "Für die Füllung"), create one section object per component with a non-null title. If no distinct components exist, return a single section with title: null. Never split arbitrarily — only create multiple sections when the original recipe explicitly names separate parts with their own ingredient lists and steps
`.trim();

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function extractJson(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in Claude response");

  // Balanced brace walk — skips braces inside string literals so extra text
  // after the closing brace doesn't corrupt the slice.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }

  // Fallback: unescaped quotes in Claude's output may confuse the string tracker.
  // Use simple first-{/last-} boundaries so repairUnescapedQuotes() can fix the rest.
  const end = raw.lastIndexOf("}");
  if (end > start) return raw.slice(start, end + 1);
  throw new Error("No JSON object found in Claude response");
}

// Heuristic repair for Claude responses that contain unescaped " inside string values
// (common when the recipe title itself contains quoted text, e.g. "I Slept in But…").
// A " is treated as an unescaped interior quote when the next non-whitespace character
// is NOT a JSON structural character (,  }  ]  :).
function repairUnescapedQuotes(raw: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === "\\") { out += ch; esc = true; continue; }
    if (ch === '"') {
      if (!inStr) { inStr = true; out += ch; continue; }
      // Peek at the next non-whitespace character
      let j = i + 1;
      while (j < raw.length && " \n\r\t".includes(raw[j])) j++;
      const next = raw[j] ?? "";
      if (",}]:".includes(next) || next === "") { inStr = false; out += ch; }
      else { out += '\\"'; } // unescaped interior quote → escape it
    } else {
      out += ch;
    }
  }
  return out;
}

function parseClaudeJson<T>(raw: string): T {
  const json = extractJson(raw);
  try {
    return JSON.parse(json) as T;
  } catch {
    // Second attempt with repaired quotes
    return JSON.parse(repairUnescapedQuotes(json)) as T;
  }
}


const REVIEW_SYSTEM = `
You are a professional recipe editor. You will receive a parsed recipe as JSON and must review and improve it.
Return ONLY the improved recipe as valid JSON in the exact same schema — no markdown fences, no extra text, no content after the closing brace.
All double-quote characters inside JSON string values must be escaped as \" — never output raw unescaped " inside a string.

Review checklist:
1. Ingredients completeness: every ingredient mentioned in steps must appear in the ingredients list and vice versa. Add missing ones; remove unused ones.
2. Realistic amounts: amounts are stored as TOTAL quantities for the complete recipe (for the stated servings count). Verify plausibility against that yield — e.g. 320 g water for 3 pizzas is correct; 500 g salt for any recipe is wrong. Do NOT halve or multiply amounts; only correct clear extraction errors.
3. Step quality: steps must be in logical cooking order, clearly written, include temperatures in °C, and include timerSeconds wherever a recipe would normally specify a time. If step text mentions non-metric units (cups, oz, °F), add the metric equivalent in parentheses within that step's text.
4. Ingredient amounts: Do NOT change any ingredient's amount or unit — treat them as authoritative values already extracted from the source. You may add a missing ingredient (one mentioned in steps but absent from the list) with amount 0 and unit "nach Bedarf". Never re-derive amounts from cup/tablespoon/teaspoon measurements in the step text.
5. German language: every text field — title, ingredient names, step texts, tags — must be in German. Use everyday home-cooking vocabulary, not professional bakery or restaurant jargon (e.g. use "große Schüssel" not "Teigtonne", "Pfanne" not "Sautoir", "Topf" not "Marmite").
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

  const improved = parseClaudeJson(block.text) as ParsedRecipe;
  improved.source = recipe.source;
  improved.recipe_type = recipe.recipe_type;
  improved.tags = normalizeTags(improved.tags);
  improved.servings = recipe.servings;

  // Build a flat lookup of parse-pass per-serving amounts by ingredient name.
  // Restore amounts by name — index-based matching fails when the review pass reorders.
  const srcAmounts = new Map<string, { amount: number; unit: string }>();
  for (const section of recipe.sections) {
    for (const ing of section.ingredients) {
      srcAmounts.set(ing.name.toLowerCase(), { amount: ing.amount, unit: ing.unit });
    }
  }

  // Restore amounts across all sections (already per-serving from parse pass)
  improved.sections = (improved.sections ?? []).map((section: RecipeSection) => ({
    ...section,
    ingredients: section.ingredients.map((ing) => {
      const src =
        srcAmounts.get(ing.name.toLowerCase()) ??
        Array.from(srcAmounts.entries()).find(
          ([k]) => k.includes(ing.name.toLowerCase()) || ing.name.toLowerCase().includes(k)
        )?.[1];
      if (src) return { ...ing, amount: src.amount, unit: src.unit };
      // New ingredient added by review — convert total → per-serving
      return improved.servings > 0
        ? { ...ing, amount: Math.round((ing.amount / improved.servings) * 100) / 100 }
        : ing;
    }),
  }));

  return improved;
}

export async function parseRecipeFromImages(
  imageUrls: string[],
  sourceValue: string
): Promise<ParsedRecipe> {
  const multi = imageUrls.length > 1;
  const content = [
    ...imageUrls.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    })),
    {
      type: "text" as const,
      text: `Read all recipe text visible in ${multi ? `these ${imageUrls.length} images` : "this image"} and extract the${multi ? " complete" : ""} recipe.${multi ? ` The images may show different parts of the same recipe (e.g. ingredients list, steps, different pages). Combine all information into one complete recipe.` : ""} Return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\nRules:\n${RULES}\n- source.type must be "photo", source.value must be "${sourceValue}"`,
    },
  ];

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");

  const parsed = parseClaudeJson(block.text) as ParsedRecipe;
  parsed.tags = normalizeTags(parsed.tags);
  const sv = Math.max(1, parsed.servings || 1);
  parsed.sections = (parsed.sections ?? []).map((section: RecipeSection) => ({
    ...section,
    ingredients: section.ingredients.map((ing) => ({
      ...ing,
      amount: Math.round((ing.amount / sv) * 100) / 100,
    })),
  }));
  return parsed;
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

  const parsed = parseClaudeJson(block.text) as ParsedRecipe;
  parsed.tags = normalizeTags(parsed.tags);
  const sv = Math.max(1, parsed.servings || 1);
  parsed.sections = (parsed.sections ?? []).map((section: RecipeSection) => ({
    ...section,
    ingredients: section.ingredients.map((ing) => ({
      ...ing,
      amount: Math.round((ing.amount / sv) * 100) / 100,
    })),
  }));
  return parsed;
}

export async function parseRecipeFromText(
  text: string,
  sourceType: SourceType,
  sourceValue: string,
  jsonLd?: JsonLdRecipeData,
  titleHint?: string
): Promise<ParsedRecipe> {
  let content: string;

  if (jsonLd) {
    // Build a minimal object — the runtime jsonLd node contains ALL schema.org fields;
    // serialising only what we need keeps the prompt clean and avoids mid-string truncation.
    const cleanJsonLd = {
      name: jsonLd.name,
      recipeYield: jsonLd.recipeYield,
      prepTime: jsonLd.prepTime,
      cookTime: jsonLd.cookTime,
      recipeIngredient: jsonLd.recipeIngredient,
      recipeInstructions: jsonLd.recipeInstructions,
    };
    const structuredData = JSON.stringify(cleanJsonLd);
    content =
      `Extract a recipe from the structured data below and return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\n` +
      `Rules:\n${RULES}\n` +
      `- source.type must be "${sourceType}", source.value must be "${sourceValue}"\n` +
      `- The STRUCTURED DATA section contains machine-readable recipe data — prioritise it over the supplementary text\n` +
      `- recipeInstructions in the structured data are in the correct order; preserve that order in your output steps\n` +
      `- recipeIngredient in the structured data is the authoritative ingredient list\n` +
      `- Do NOT include any UI element text from the supplementary text (buttons, icons, "Expand", tick icons, breadcrumbs, accordion labels)\n\n` +
      `STRUCTURED DATA (schema.org/Recipe):\n${structuredData}\n\n` +
      `SUPPLEMENTARY TEXT (use only to fill gaps not in the structured data):\n${text.slice(0, 6000)}`;
  } else {
    const titleRule = titleHint
      ? `- You are extracting the recipe titled "${titleHint}". Focus ONLY on this recipe — ignore all other dish names, recipe titles, or cross-links found in the text.\n`
      : "";
    content =
      `Extract the recipe from the following text and return it as valid JSON matching this schema exactly:\n${RECIPE_SCHEMA}\n\n` +
      `Rules:\n${RULES}\n` +
      `${titleRule}` +
      `- source.type must be "${sourceType}", source.value must be "${sourceValue}"\n\n` +
      `Text:\n${text.slice(0, 15000)}`;
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Unexpected Claude response type");

  const parsed = parseClaudeJson(block.text) as ParsedRecipe;
  parsed.tags = normalizeTags(parsed.tags);
  const sv = Math.max(1, parsed.servings || 1);
  parsed.sections = (parsed.sections ?? []).map((section: RecipeSection) => ({
    ...section,
    ingredients: section.ingredients.map((ing) => ({
      ...ing,
      amount: Math.round((ing.amount / sv) * 100) / 100,
    })),
  }));
  return parsed;
}
