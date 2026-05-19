import React from "react";
import { render, screen } from "@testing-library/react";
import RecipeEditForm from "@/components/RecipeEditForm";
import type { Recipe } from "@/types/recipe";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const baseRecipe: Recipe = {
  id: "r1",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  user_id: "u1",
  title: "Test",
  description: "",
  servings: 4,
  prep_time: 10,
  cook_time: 20,
  recipe_type: "kochen",
  ingredients: [
    { amount: 100, unit: "g", name: "Mehl" },
    { amount: 2, unit: "Stück", name: "Eier" },
  ],
  steps: [
    { order: 1, text: "Zutaten vermengen.", timerSeconds: null },
    { order: 2, text: "Backen.", timerSeconds: 1200 },
  ],
  sections: null,
  tags: ["einfach"],
  source_type: "manual",
  source_value: "manual",
  source_title: null,
  image_url: null,
  step_images: null,
  favorite: false,
  scalable: true,
  is_private: false,
  kcal_per_serving: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  nutrition_breakdown: null,
};

function findAllControls() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("input, textarea, select")
  ).filter((el) => (el as HTMLInputElement).type !== "hidden");
}

function hasAccessibleName(el: HTMLElement) {
  if (el.getAttribute("aria-label")) return true;
  if (el.getAttribute("aria-labelledby")) return true;
  if (el.closest("label")) return true;
  if (el.id) {
    if (document.querySelector(`label[for="${el.id}"]`)) return true;
  }
  return false;
}

describe("RecipeEditForm accessibility", () => {
  it("every visible form control has an accessible name", () => {
    render(<RecipeEditForm recipe={baseRecipe} />);

    const controls = findAllControls();
    const unlabeled = controls.filter((c) => !hasAccessibleName(c));

    expect(unlabeled).toEqual([]);
    // Sanity: should have rendered enough controls (title, desc, 3 meta, 2x3 ingredient inputs, 2 step textareas, image url, tag input)
    expect(controls.length).toBeGreaterThanOrEqual(13);
  });

  it("named top-level fields are reachable via getByLabelText", () => {
    render(<RecipeEditForm recipe={baseRecipe} />);

    expect(screen.getByLabelText("Titel")).toBeInTheDocument();
    expect(screen.getByLabelText(/Beschreibung/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Portionen/)).toBeInTheDocument();
    expect(screen.getByLabelText("Vorbereitung (Min.)")).toBeInTheDocument();
    expect(screen.getByLabelText("Kochen (Min.)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Titelbild-URL/)).toBeInTheDocument();
  });

  it("each ingredient row exposes Menge / Einheit / Name labels", () => {
    render(<RecipeEditForm recipe={baseRecipe} />);

    expect(screen.getByLabelText("Menge für Zutat 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Einheit für Zutat 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Name für Zutat 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Menge für Zutat 2")).toBeInTheDocument();
  });

  it("each step textarea is labeled by its position", () => {
    render(<RecipeEditForm recipe={baseRecipe} />);

    expect(screen.getByLabelText("Schritt 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Schritt 2")).toBeInTheDocument();
  });

  it("section title input is labeled when in multi-section mode", () => {
    const multi: Recipe = {
      ...baseRecipe,
      sections: [
        {
          title: "Für den Teig",
          ingredients: [{ amount: 1, unit: "Stück", name: "Ei" }],
          steps: [{ order: 1, text: "Verquirlen.", timerSeconds: null }],
        },
        {
          title: "Für die Füllung",
          ingredients: [{ amount: 100, unit: "g", name: "Käse" }],
          steps: [{ order: 1, text: "Reiben.", timerSeconds: null }],
        },
      ],
    };
    render(<RecipeEditForm recipe={multi} />);

    expect(screen.getByLabelText("Titel von Abschnitt 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Titel von Abschnitt 2")).toBeInTheDocument();
  });
});
