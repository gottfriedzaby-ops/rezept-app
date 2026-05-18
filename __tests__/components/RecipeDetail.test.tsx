import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import RecipeDetail from "@/components/RecipeDetail";
import type { Recipe } from "@/types/recipe";

jest.mock("next/link", () => {
  return function Link({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  };
});

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "recipe-abc",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    title: "Tomatensoße",
    description: null,
    servings: 4,
    prep_time: 10,
    cook_time: 30,
    recipe_type: "kochen",
    ingredients: [
      { amount: 200, unit: "g", name: "Tomaten" },
      { amount: 1, unit: "EL", name: "Olivenöl" },
    ],
    steps: [
      { order: 1, text: "Tomaten hacken.", timerSeconds: null },
      { order: 2, text: "30 Min. köcheln.", timerSeconds: 1800 },
    ],
    sections: null,
    tags: ["pasta", "vegetarisch"],
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
    ...overrides,
  };
}

describe("RecipeDetail — servings display", () => {
  it("renders the initial serving count", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("increments servings when '+' button is clicked", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("decrements servings when '−' button is clicked", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    fireEvent.click(screen.getByLabelText("Weniger Portionen"));
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not decrement below 1 for scalable recipes", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 1, scalable: true })} />);
    fireEvent.click(screen.getByLabelText("Weniger Portionen"));
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("disables '−' button at minimum servings", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 1 })} />);
    expect(screen.getByLabelText("Weniger Portionen")).toBeDisabled();
  });

  it("'−' button is not disabled above minimum", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    expect(screen.getByLabelText("Weniger Portionen")).not.toBeDisabled();
  });
});

describe("RecipeDetail — ingredient scaling", () => {
  it("renders ingredient amounts at initial servings", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 1 })} />);
    expect(screen.getByText("200 g")).toBeInTheDocument();
  });

  it("doubles ingredient amounts when servings are doubled", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 1 })} />);
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("400 g")).toBeInTheDocument();
  });

  it("reduces ingredient amounts when servings decrease", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 2 })} />);
    // At servings=2: formatAmount(200, 2) = 400g
    expect(screen.getByText("400 g")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Weniger Portionen"));
    // At servings=1: formatAmount(200, 1) = 200g
    expect(screen.getByText("200 g")).toBeInTheDocument();
  });
});

describe("RecipeDetail — scalable: false", () => {
  it("disables '−' button at the recipe's fixed serving count", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4, scalable: false })} />);
    expect(screen.getByLabelText("Weniger Portionen")).toBeDisabled();
  });

  it("still allows increasing servings when scalable is false", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4, scalable: false })} />);
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows a note about fixed servings when at minimum", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4, scalable: false })} />);
    expect(screen.getByText(/nicht weiter reduziert/i)).toBeInTheDocument();
  });
});

describe("RecipeDetail — cook mode link", () => {
  it("renders a link to cook mode with current servings", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/recipe-abc/cook?servings=4");
  });

  it("updates cook mode link when servings change", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/recipe-abc/cook?servings=5");
  });
});

describe("RecipeDetail — step rendering", () => {
  it("renders all recipe steps", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    expect(screen.getByText("Tomaten hacken.")).toBeInTheDocument();
    expect(screen.getByText(/30 Min\. köcheln\./)).toBeInTheDocument();
  });

  it("shows timer duration in minutes for steps with timerSeconds", () => {
    render(<RecipeDetail recipe={makeRecipe()} />);
    // 1800 seconds = 30 minutes
    expect(screen.getByText("(30 Min.)")).toBeInTheDocument();
  });

  it("renders step images when step_images contains a URL", () => {
    const recipe = makeRecipe({ step_images: ["https://example.com/step1.jpg", null as unknown as string] });
    render(<RecipeDetail recipe={recipe} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/step1.jpg");
  });
});

describe("RecipeDetail — meta-row scope (FR-81 / B5)", () => {
  it("updates the 'X Portionen' label when the scaler changes", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4 })} />);
    expect(screen.getByText("4 Portionen")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("5 Portionen")).toBeInTheDocument();
  });

  it("does NOT mutate Vorbereitung when the scaler changes", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4, prep_time: 10 })} />);
    expect(screen.getByText("Vorbereitung 10 Min.")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("Vorbereitung 10 Min.")).toBeInTheDocument();
  });

  it("does NOT mutate Kochzeit when the scaler changes", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4, cook_time: 30 })} />);
    expect(screen.getByText("Kochzeit 30 Min.")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("Kochzeit 30 Min.")).toBeInTheDocument();
  });

  it("does NOT mutate Gesamt time when the scaler changes", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 4, prep_time: 10, cook_time: 30 })} />);
    expect(screen.getByText("Gesamt 40 Min.")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("Gesamt 40 Min.")).toBeInTheDocument();
  });
});

describe("RecipeDetail — Portion singular/plural (B6)", () => {
  it("renders 'Portion' (singular) when scaler is at 1", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 1 })} />);
    expect(screen.getByText("1 Portion")).toBeInTheDocument();
    expect(screen.queryByText("1 Portionen")).not.toBeInTheDocument();
  });

  it("renders 'Portionen' (plural) when scaler is above 1", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 2 })} />);
    expect(screen.getByText("2 Portionen")).toBeInTheDocument();
  });

  it("flips to singular when scaling down to 1", () => {
    render(<RecipeDetail recipe={makeRecipe({ servings: 2 })} />);
    expect(screen.getByText("2 Portionen")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Weniger Portionen"));
    expect(screen.getByText("1 Portion")).toBeInTheDocument();
  });
});

describe("RecipeDetail — non-scalable units (FR-81 / B8)", () => {
  it("does NOT multiply ingredients with empty unit", () => {
    // Mix scalable + non-scalable so the test can assert against the scalable row's change
    // without colliding with the stepper "1"/"3" text.
    const recipe = makeRecipe({
      servings: 1,
      ingredients: [
        { amount: 100, unit: "g", name: "Tomaten" },
        { amount: 1, unit: "", name: "Lorbeerblatt" },
      ],
    });
    render(<RecipeDetail recipe={recipe} />);
    expect(screen.getByText("100 g")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    // Scaler now at 3 → scalable row scales (300 g), non-scalable row stays at "1"
    expect(screen.getByText("300 g")).toBeInTheDocument();
    expect(screen.queryByText("3 Lorbeerblatt")).not.toBeInTheDocument();
  });

  it("DOES multiply ingredients with a non-empty unit (regression guard)", () => {
    const recipe = makeRecipe({
      servings: 1,
      ingredients: [{ amount: 100, unit: "g", name: "Tomaten" }],
    });
    render(<RecipeDetail recipe={recipe} />);
    expect(screen.getByText("100 g")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    expect(screen.getByText("200 g")).toBeInTheDocument();
  });

  it("treats amount=null (cast) as non-scalable, rendering only the unit", () => {
    // amount=null can occur at runtime (JSONB stores null for non-numeric quantities
    // like "Prise"). The Ingredient TS type says number, so we cast.
    const recipe = makeRecipe({
      servings: 1,
      ingredients: [
        { amount: null as unknown as number, unit: "Prise", name: "Salz" },
      ],
    });
    const { container } = render(<RecipeDetail recipe={recipe} />);
    expect(screen.getByText("Prise")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Mehr Portionen"));
    // Still "Prise" at any scale — the amount cell never shows a multiplier.
    expect(container.textContent).toMatch(/Prise.*Salz/);
    expect(container.textContent).not.toMatch(/2 Prise/);
  });
});

describe("RecipeDetail — multi-section recipe", () => {
  it("renders section headers for named sections", () => {
    const recipe = makeRecipe({
      ingredients: [],
      steps: [],
      sections: [
        {
          title: "Teig",
          ingredients: [{ amount: 200, unit: "g", name: "Mehl" }],
          steps: [{ order: 1, text: "Teig kneten.", timerSeconds: null }],
        },
        {
          title: "Füllung",
          ingredients: [{ amount: 100, unit: "g", name: "Zucker" }],
          steps: [{ order: 2, text: "Füllung zubereiten.", timerSeconds: null }],
        },
      ],
    });
    render(<RecipeDetail recipe={recipe} />);
    expect(screen.getAllByText("Teig").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Füllung").length).toBeGreaterThan(0);
  });
});
