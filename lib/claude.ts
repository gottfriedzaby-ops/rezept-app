import Anthropic from "@anthropic-ai/sdk";
import type { ParsedRecipe, RecipeSection, SourceType } from "@/types/recipe";
import { normalizeTags } from "@/lib/tags";

export interface ClaudeCallMeta {
  timestamp: string;
  function: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: "success" | "error";
  error?: string;
}

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

type ClaudeFunctionName =
  | "parseRecipeFromText"
  | "parseRecipeFromImage"
  | "parseRecipeFromImages"
  | "reviewAndImproveRecipe";

async function claudeCreate(
  functionName: ClaudeFunctionName,
  params: Parameters<typeof client.messages.create>[0]
): Promise<{ message: Anthropic.Message; meta: ClaudeCallMeta }> {
  const start = Date.now();
  try {
    const message = (await client.messages.create(params)) as Anthropic.Message;
    const meta: ClaudeCallMeta = {
      timestamp: new Date().toISOString(),
      function: functionName,
      model: params.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      durationMs: Date.now() - start,
      status: "success",
    };
    return { message, meta };
  } catch (err) {
    console.error("[Claude API error]", {
      function: functionName,
      model: params.model,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

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
- EL (Esslöffel) and TL (Teelöffel) are German cooking units — keep them exactly as written; do NOT convert to ml. Store "3 EL Olivenöl" as amount: 3, unit: "EL". Store "1 TL Salz" as amount: 1, unit: "TL". Prise is also a valid unit; store as amount: 1, unit: "Prise". Only the ingredient list/table is authoritative for unit and amount — do NOT derive amounts from EL/TL mentions inside step text
- Store ingredient amounts as the TOTAL quantity for the complete recipe as written — do NOT divide by serving count (e.g. recipe serves 4, needs 400 g flour → store 400, not 100). If the source lists amounts "per serving" or "for 1 person", multiply each amount by the total number of servings before storing. Never output per-serving amounts — always total amounts for all servings combined
- The "servings" field must reflect the recipe's actual yield (number of portions the total amounts produce)
- scalable: set to false when the recipe requires a whole indivisible unit that cannot reasonably be prepared in a smaller fraction (e.g. a whole roast, whole fish, a full cake baked as one). Set to true for all other recipes (pasta, pizza, soups, doughs, etc.)
- timerSeconds: null if the step has no specific time, otherwise the duration in seconds
- If a numeric field is unknown use 0; infer tags from ingredients and title
- tags: always lowercase German (e.g. "vegetarisch", "italienisch", "schnell") — never English, never capitalised
- recipe_type: classify as "backen" for oven-baked goods requiring precise temperature/timing (bread, cakes, cookies, quiche), "grillen" for open-flame or griddle cooking (BBQ, Grillgemüse), "zubereiten" for no-heat assembly recipes (salads, smoothies, overnight oats, sandwiches), "kochen" for everything else. Default to "kochen" when uncertain
- sections: if the recipe has distinct named components (e.g. "Für die Soße", "Für den Teig", "Für die Füllung"), create one section object per component with a non-null title. If no distinct components exist, return a single section with title: null. Never split arbitrarily — only create multiple sections when the original recipe explicitly names separate parts with their own ingredient lists and steps
- Copy ingredient names EXACTLY as they appear in the source text. Do NOT substitute, rename, or omit any ingredient based on your knowledge of the dish type. Include every ingredient explicitly listed, even if the combination seems unusual for the recipe (e.g. sausages in lentil soup, bacon in a vegetable stew).
- Do NOT draw on your training knowledge of how a dish is typically prepared. Extract ONLY what is explicitly written in the provided text — nothing more, nothing less. If an ingredient is not mentioned in the text, do not add it.
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
1. Ingredients completeness: every ingredient mentioned in steps must appear in the ingredients list. Add missing ones (amount 0, unit "nach Bedarf"). Remove an ingredient from the list ONLY if it is genuinely never referenced anywhere in the step text. Do NOT add ingredients based on your knowledge of the dish type; do NOT remove ingredients that seem atypical — unusual combinations (e.g. smoked sausages in lentil soup, bacon in a vegetable stew) are intentional and must be preserved exactly.
2. Realistic amounts: amounts are stored as TOTAL quantities for the complete recipe (for the stated servings count). Verify plausibility against that yield — e.g. 320 g water for 3 pizzas is correct; 500 g salt for any recipe is wrong. Do NOT halve or multiply amounts; only correct clear extraction errors.
3. Step quality: steps must be in logical cooking order, clearly written, include temperatures in °C, and include timerSeconds wherever a recipe would normally specify a time. If step text mentions non-metric units (cups, oz, °F), add the metric equivalent in parentheses within that step's text.
4. Ingredient amounts: Do NOT change any ingredient's amount or unit — treat them as authoritative values already extracted from the source. You may add a missing ingredient (one mentioned in steps but absent from the list) with amount 0 and unit "nach Bedarf". Never re-derive amounts from cup/tablespoon/teaspoon measurements in the step text.
5. German language: every text field — title, ingredient names, step texts, tags — must be in German. Use everyday home-cooking vocabulary, not professional bakery or restaurant jargon (e.g. use "große Schüssel" not "Teigtonne", "Pfanne" not "Sautoir", "Topf" not "Marmite").
6. Tags: provide accurate, useful tags covering cuisine type, meal type (Frühstück, Mittagessen, Abendessen, Dessert, Snack, Beilage), dietary info (vegetarisch, vegan, glutenfrei, laktosefrei), and difficulty (einfach, mittel, aufwändig). Use lowercase German.
7. Ingredient fidelity: the input recipe JSON is the authoritative source. Preserve every ingredient name exactly as given. Do NOT replace names with synonyms or "more typical" alternatives. Do NOT add ingredients absent from the input just because they are commonly found in this dish type.
`.trim();

export async function reviewAndImproveRecipe(recipe: ParsedRecipe): Promise<{ recipe: ParsedRecipe; meta: ClaudeCallMeta }> {
  const { message, meta } = await claudeCreate("reviewAndImproveRecipe", {
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
  // Build per-section amount maps from the parse pass (amounts already per-serving).
  // Keyed by section title (lowercase) so we survive review-pass reordering.
  // A pure index-based approach breaks when the review pass returns sections in a
  // different order (e.g. "Suppe" before "Chiliöl"), silently swapping their amounts.
  type AmountMap = Map<string, { amount: number; unit: string }>;

  const sectionAmountMaps: AmountMap[] = recipe.sections.map((section) => {
    const map: AmountMap = new Map();
    for (const ing of section.ingredients) {
      map.set(ing.name.toLowerCase(), { amount: ing.amount, unit: ing.unit });
    }
    return map;
  });

  // Title → amount map for O(1) lookup by section title after review reorders sections.
  const amountMapByTitle = new Map<string, AmountMap>();
  recipe.sections.forEach((section, i) => {
    if (section.title) amountMapByTitle.set(section.title.toLowerCase(), sectionAmountMaps[i]);
  });

  // Global fallback: first-occurrence wins; used for newly added ingredients or single-section recipes.
  const globalAmounts: AmountMap = new Map();
  for (const sectionMap of sectionAmountMaps) {
    sectionMap.forEach((val, name) => {
      if (!globalAmounts.has(name)) globalAmounts.set(name, val);
    });
  }

  function findInMap(nameLower: string, map: AmountMap | undefined): { amount: number; unit: string } | undefined {
    if (!map) return undefined;
    return (
      map.get(nameLower) ??
      Array.from(map.entries()).find(([k]) => k.includes(nameLower) || nameLower.includes(k))?.[1]
    );
  }

  // Restore amounts: match by section title first (survives reordering), fall back to index, then global.
  improved.sections = (improved.sections ?? []).map((section: RecipeSection, sIdx: number) => {
    const titleKey = section.title?.toLowerCase() ?? "";
    const sectionMap =
      (titleKey ? amountMapByTitle.get(titleKey) : undefined) ?? sectionAmountMaps[sIdx];
    return {
      ...section,
      ingredients: section.ingredients.map((ing) => {
        const src = findInMap(ing.name.toLowerCase(), sectionMap) ?? findInMap(ing.name.toLowerCase(), globalAmounts);
        if (src) return { ...ing, amount: src.amount, unit: src.unit };
        // New ingredient added by review — convert total → per-serving
        return improved.servings > 0
          ? { ...ing, amount: Math.round((ing.amount / improved.servings) * 100) / 100 }
          : ing;
      }),
    };
  });

  return { recipe: improved, meta };
}

export async function parseRecipeFromImages(
  imageUrls: string[],
  sourceValue: string
): Promise<{ recipe: ParsedRecipe; meta: ClaudeCallMeta }> {
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

  const { message, meta } = await claudeCreate("parseRecipeFromImages", {
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
  return { recipe: parsed, meta };
}

export async function parseRecipeFromImage(
  base64: string,
  mediaType: ImageMediaType,
  sourceValue: string
): Promise<{ recipe: ParsedRecipe; meta: ClaudeCallMeta }> {
  const { message, meta } = await claudeCreate("parseRecipeFromImage", {
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
  return { recipe: parsed, meta };
}

export async function parseRecipeFromText(
  text: string,
  sourceType: SourceType,
  sourceValue: string,
  jsonLd?: JsonLdRecipeData,
  titleHint?: string
): Promise<{ recipe: ParsedRecipe; meta: ClaudeCallMeta }> {
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

  const { message, meta } = await claudeCreate("parseRecipeFromText", {
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
  return { recipe: parsed, meta };
}
