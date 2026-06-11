import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeRating from "@/components/RecipeRating";
import RecipeNotes from "@/components/RecipeNotes";

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("RecipeRating", () => {
  it("renders five stars with the current rating checked", () => {
    render(<RecipeRating recipeId="r1" initialRating={3} />);

    const group = screen.getByRole("radiogroup", { name: "Bewertung" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3 Sterne" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: "1 Stern" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });

  it("PATCHes the selected rating", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    render(<RecipeRating recipeId="r1" initialRating={null} />);

    await user.click(screen.getByRole("radio", { name: "4 Sterne" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/recipes/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: 4 }),
    });
    expect(screen.getByRole("radio", { name: "4 Sterne" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  it("clicking the active star clears the rating", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    render(<RecipeRating recipeId="r1" initialRating={4} />);

    await user.click(screen.getByRole("radio", { name: "4 Sterne" }));

    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      rating: null,
    });
  });

  it("reverts on API failure", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    render(<RecipeRating recipeId="r1" initialRating={2} />);

    await user.click(screen.getByRole("radio", { name: "5 Sterne" }));

    expect(screen.getByRole("radio", { name: "2 Sterne" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});

describe("RecipeNotes", () => {
  it("saves notes via PATCH and shows the saved state", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    render(<RecipeNotes recipeId="r1" initialNotes={null} />);

    await user.type(screen.getByLabelText("Meine Notizen"), "Weniger Salz!");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(global.fetch).toHaveBeenCalledWith("/api/recipes/r1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Weniger Salz!" }),
    });
    expect(await screen.findByText("Gespeichert")).toBeInTheDocument();
  });

  it("sends null when the notes are emptied", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    render(<RecipeNotes recipeId="r1" initialNotes="Alt" />);

    await user.clear(screen.getByLabelText("Meine Notizen"));
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      notes: null,
    });
  });

  it("shows an error message when saving fails", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    render(<RecipeNotes recipeId="r1" initialNotes={null} />);

    await user.type(screen.getByLabelText("Meine Notizen"), "Test");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Speichern fehlgeschlagen. Bitte erneut versuchen."
    );
  });

  it("disables the save button while nothing changed", () => {
    render(<RecipeNotes recipeId="r1" initialNotes="Bestand" />);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
  });
});
