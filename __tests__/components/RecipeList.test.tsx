import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import RecipeList from "@/components/RecipeList";
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

jest.mock("next/image", () => {
  return function Image(props: Record<string, unknown>) {
    const { src, alt } = props as { src: string; alt: string };
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} alt={alt} />;
  };
});

const mockReplace = jest.fn();
const mockSearchParams = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/",
}));

function setSearchParams(qs: string) {
  mockSearchParams.mockReturnValue(new URLSearchParams(qs));
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    title: "Tomatensoße",
    description: null,
    servings: 4,
    prep_time: 10,
    cook_time: 30,
    recipe_type: "kochen",
    ingredients: [{ amount: 800, unit: "g", name: "Tomaten" }],
    steps: [{ order: 1, text: "Kochen.", timerSeconds: null }],
    sections: null,
    tags: ["pasta"],
    source_type: "manual",
    source_value: "manual",
    source_title: null,
    image_url: null,
    step_images: null,
    favorite: false,
    scalable: true,
    is_private: false,
    user_id: "u1",
    kcal_per_serving: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    nutrition_breakdown: null,
    ...overrides,
  };
}

function getCardTitles(): string[] {
  return screen
    .queryAllByRole("heading", { level: 3 })
    .map((h) => h.textContent ?? "");
}

beforeEach(() => {
  mockReplace.mockReset();
  mockSearchParams.mockReset();
  setSearchParams("");
});

// ---------------------------------------------------------------------------
// FE-03: Empty state
// ---------------------------------------------------------------------------

describe("RecipeList — empty state (FE-03)", () => {
  // RL-E-01
  it("shows the 'Nichts gefunden' empty state when a search matches nothing", () => {
    setSearchParams("q=xxxxnotfound");
    render(
      <RecipeList recipes={[makeRecipe({ title: "Tomatensoße" })]} />
    );

    expect(screen.getByText("Nichts gefunden")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Filter zurücksetzen/ })
    ).toBeInTheDocument();
  });

  // RL-E-02
  it("'Filter zurücksetzen' calls router.replace with no filter params", () => {
    setSearchParams("q=xxxx&fav=1&tag=pasta");
    render(<RecipeList recipes={[makeRecipe()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Filter zurücksetzen/ }));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const targetUrl = mockReplace.mock.calls[0][0] as string;
    expect(targetUrl).not.toMatch(/[?&]q=/);
    expect(targetUrl).not.toMatch(/[?&]fav=/);
    expect(targetUrl).not.toMatch(/[?&]tag=/);
  });

  // RL-E-03
  it("does not show the empty state when matching recipes exist", () => {
    setSearchParams("q=tomate");
    render(<RecipeList recipes={[makeRecipe({ title: "Tomatensoße" })]} />);

    expect(screen.queryByText("Nichts gefunden")).not.toBeInTheDocument();
    expect(getCardTitles()).toContain("Tomatensoße");
  });

  it("shows the no-filter message (not empty state) when the list is empty and no filter is active", () => {
    render(<RecipeList recipes={[]} />);

    expect(screen.queryByText("Nichts gefunden")).not.toBeInTheDocument();
    expect(screen.getByText("Keine Rezepte gefunden.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FE-06: Expanded search (title / tag / ingredient)
// ---------------------------------------------------------------------------

describe("RecipeList — expanded search (FE-06)", () => {
  const recipes = [
    makeRecipe({
      id: "r-title",
      title: "Tomatensoße",
      tags: ["pasta"],
      ingredients: [{ amount: 800, unit: "g", name: "Tomaten" }],
    }),
    makeRecipe({
      id: "r-ing",
      title: "Pasta Aglio e Olio",
      tags: ["pasta"],
      ingredients: [{ amount: 3, unit: "", name: "Knoblauch" }],
    }),
    makeRecipe({
      id: "r-tag",
      title: "Kartoffelsuppe",
      tags: ["vegetarisch"],
      ingredients: [{ amount: 500, unit: "g", name: "Kartoffeln" }],
    }),
  ];

  // RL-S-01
  it("matches a recipe by its title", () => {
    setSearchParams("q=tomate");
    render(<RecipeList recipes={recipes} />);

    expect(getCardTitles()).toEqual(["Tomatensoße"]);
  });

  // RL-S-02
  it("matches a recipe by an ingredient name", () => {
    setSearchParams("q=knoblauch");
    render(<RecipeList recipes={recipes} />);

    expect(getCardTitles()).toEqual(["Pasta Aglio e Olio"]);
  });

  // RL-S-03
  it("matches a recipe by a tag", () => {
    setSearchParams("q=vegetar");
    render(<RecipeList recipes={recipes} />);

    expect(getCardTitles()).toEqual(["Kartoffelsuppe"]);
  });

  // RL-S-04
  it("falls through to the empty state when the search matches nothing", () => {
    setSearchParams("q=zuckertomate");
    render(<RecipeList recipes={recipes} />);

    expect(screen.getByText("Nichts gefunden")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FE-07: Sort control
// ---------------------------------------------------------------------------

describe("RecipeList — sort control (FE-07)", () => {
  const a = makeRecipe({
    id: "a",
    title: "Apfelkuchen",
    prep_time: 20,
    cook_time: 40, // total 60
  });
  const z = makeRecipe({
    id: "z",
    title: "Zuppa Toscana",
    prep_time: 5,
    cook_time: 25, // total 30
  });

  // RL-O-01
  it("preserves the input order when sort is 'newest' (the default)", () => {
    // Input is already in newest-first order
    render(<RecipeList recipes={[z, a]} />);
    expect(getCardTitles()).toEqual(["Zuppa Toscana", "Apfelkuchen"]);
  });

  // RL-O-02
  it("sorts alphabetically when ?sort=az", () => {
    setSearchParams("sort=az");
    render(<RecipeList recipes={[z, a]} />);
    expect(getCardTitles()).toEqual(["Apfelkuchen", "Zuppa Toscana"]);
  });

  // RL-O-03
  it("sorts by ascending total cook time when ?sort=time", () => {
    setSearchParams("sort=time");
    render(<RecipeList recipes={[a, z]} />);
    expect(getCardTitles()).toEqual(["Zuppa Toscana", "Apfelkuchen"]);
  });

  // RL-O-04
  it("changing the sort <select> calls router.replace with sort param", () => {
    render(<RecipeList recipes={[a, z]} />);
    const select = screen.getByLabelText("Sortierung") as HTMLSelectElement;

    fireEvent.change(select, { target: { value: "az" } });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    const url = mockReplace.mock.calls[0][0] as string;
    expect(url).toMatch(/sort=az/);
  });

  it("selecting 'newest' clears the sort param from the URL", () => {
    setSearchParams("sort=az");
    render(<RecipeList recipes={[a, z]} />);

    fireEvent.change(screen.getByLabelText("Sortierung"), {
      target: { value: "newest" },
    });

    const url = mockReplace.mock.calls[0][0] as string;
    expect(url).not.toMatch(/sort=/);
  });
});

// ---------------------------------------------------------------------------
// FE-10: URL-bound filter state
// ---------------------------------------------------------------------------

describe("RecipeList — URL-bound filter state (FE-10)", () => {
  // RL-U-01
  it("search input value reflects ?q on initial render", () => {
    setSearchParams("q=pasta");
    render(<RecipeList recipes={[makeRecipe()]} />);

    const input = screen.getByPlaceholderText("Suchen…") as HTMLInputElement;
    expect(input.value).toBe("pasta");
  });

  // RL-U-02
  it("typing in the search input calls router.replace with q param", () => {
    render(<RecipeList recipes={[makeRecipe()]} />);

    fireEvent.change(screen.getByPlaceholderText("Suchen…"), {
      target: { value: "tomate" },
    });

    const url = mockReplace.mock.calls[0][0] as string;
    expect(url).toMatch(/q=tomate/);
  });

  // RL-U-03
  it("an active tag filter (?tag=) appears highlighted", () => {
    setSearchParams("tag=pasta");
    render(<RecipeList recipes={[makeRecipe({ tags: ["pasta"] })]} />);

    // Tag pill button "pasta" appears in the filter bar AND in the card.
    // The active (in filter bar) variant uses the forest button class.
    const buttons = screen.getAllByRole("button", { name: /pasta/i });
    const activeBtn = buttons.find((b) =>
      b.className.includes("bg-forest")
    );
    expect(activeBtn).toBeDefined();
  });

  // RL-U-04
  it("?fav=1 hides non-favourite recipes", () => {
    setSearchParams("fav=1");
    render(
      <RecipeList
        recipes={[
          makeRecipe({ id: "fav-yes", title: "Mein Favorit", favorite: true }),
          makeRecipe({ id: "fav-no", title: "Andere Sache", favorite: false }),
        ]}
      />
    );

    expect(getCardTitles()).toEqual(["Mein Favorit"]);
  });
});
