import type { Recipe } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";

export function toSchemaOrgRecipe(recipe: Recipe): object {
  const sections = getRecipeSections(recipe);
  const allIngredients = sections.flatMap((s) => s.ingredients);
  const allSteps = sections
    .flatMap((s) => s.steps)
    .sort((a, b) => a.order - b.order);

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.description ?? undefined,
    recipeYield: recipe.servings?.toString(),
    prepTime: recipe.prep_time ? `PT${recipe.prep_time}M` : undefined,
    cookTime: recipe.cook_time ? `PT${recipe.cook_time}M` : undefined,
    image: recipe.image_url ?? undefined,
    keywords: recipe.tags.length > 0 ? recipe.tags.join(", ") : undefined,
    recipeIngredient: allIngredients.map((i) =>
      `${i.amount > 0 ? i.amount : ""} ${i.unit} ${i.name}`
        .replace(/\s+/g, " ")
        .trim()
    ),
    recipeInstructions: allSteps.map((s) => ({
      "@type": "HowToStep",
      text: s.text,
    })),
    url:
      recipe.source_type === "url" ? recipe.source_value : undefined,
  };
}

export function toPlainText(recipe: Recipe): string {
  const sections = getRecipeSections(recipe);
  const allIngredients = sections.flatMap((s) => s.ingredients);
  const allSteps = sections
    .flatMap((s) => s.steps)
    .sort((a, b) => a.order - b.order);

  const lines: string[] = [
    recipe.title,
    "",
    `Portionen: ${recipe.servings ?? "–"}`,
  ];
  if (recipe.prep_time) lines.push(`Vorbereitung: ${recipe.prep_time} Min.`);
  if (recipe.cook_time) lines.push(`Kochzeit: ${recipe.cook_time} Min.`);
  lines.push("", "Zutaten:", ...allIngredients.map((i) => `• ${i.amount > 0 ? i.amount : ""} ${i.unit} ${i.name}`.replace(/\s+/g, " ").trim()));
  lines.push("", "Zubereitung:", ...allSteps.map((s, idx) => `${idx + 1}. ${s.text}`));

  return lines.join("\n");
}
