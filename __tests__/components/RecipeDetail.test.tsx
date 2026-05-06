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
    expect(screen.getByText("Teig")).toBeInTheDocument();
    expect(screen.getByText("Füllung")).toBeInTheDocument();
  });
});
