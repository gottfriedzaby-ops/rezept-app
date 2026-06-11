import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeList from "@/components/RecipeList";
import type { Recipe } from "@/types/recipe";

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/",
}));

function makeRecipe(id: string, overrides: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title: `Rezept ${id}`,
    servings: 2,
    prep_time: 10,
    cook_time: 20,
    recipe_type: "kochen",
    sections: null,
    ingredients: [],
    steps: [],
    tags: ["pasta"],
    source_type: "manual",
    source_value: "manual",
    scalable: true,
    favorite: false,
    image_url: null,
    step_images: null,
    user_id: "user-1",
    is_private: false,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  } as Recipe;
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("RecipeList — server mode", () => {
  it("shows the load-more button with the remaining count", () => {
    render(
      <RecipeList
        recipes={[makeRecipe("r1"), makeRecipe("r2")]}
        serverSearch
        allTags={["pasta"]}
        initialTotal={5}
      />
    );

    expect(screen.getByRole("button", { name: "Mehr laden (3)" })).toBeInTheDocument();
  });

  it("hides the load-more button when everything is loaded", () => {
    render(
      <RecipeList
        recipes={[makeRecipe("r1")]}
        serverSearch
        allTags={[]}
        initialTotal={1}
      />
    );

    expect(screen.queryByRole("button", { name: /Mehr laden/ })).not.toBeInTheDocument();
  });

  it("appends the next page from /api/recipes/search on load-more", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { recipes: [makeRecipe("r3")], total: 3, offset: 2, limit: 24 },
        error: null,
      }),
    });

    render(
      <RecipeList
        recipes={[makeRecipe("r1"), makeRecipe("r2")]}
        serverSearch
        allTags={[]}
        initialTotal={3}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mehr laden (1)" }));

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain("/api/recipes/search?");
    expect(url).toContain("offset=2");

    expect(await screen.findByText("Rezept r3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mehr laden/ })).not.toBeInTheDocument();
  });

  it("shows an inline error when load-more fails and allows retrying", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ data: null, error: "kaputt" }),
    });

    render(
      <RecipeList
        recipes={[makeRecipe("r1")]}
        serverSearch
        allTags={[]}
        initialTotal={2}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mehr laden (1)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Rezepte konnten nicht geladen werden."
    );
    // Button is still there for a retry
    expect(screen.getByRole("button", { name: "Mehr laden (1)" })).toBeInTheDocument();
  });

  it("renders the globally ranked tag bar from allTags", () => {
    render(
      <RecipeList
        recipes={[makeRecipe("r1")]}
        serverSearch
        allTags={["pasta", "vegetarisch", "suppe"]}
        initialTotal={1}
      />
    );

    expect(screen.getByRole("button", { name: "pasta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "vegetarisch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "suppe" })).toBeInTheDocument();
  });
});
