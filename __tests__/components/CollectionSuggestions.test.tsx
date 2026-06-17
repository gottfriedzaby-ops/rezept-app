import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CollectionSuggestions from "@/components/CollectionSuggestions";
import type { CollectionSuggestion } from "@/lib/collection-suggestions";

const refreshMock = jest.fn();
jest.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function okJson(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => ({ data, error: null }) });
}

const dessertSuggestion: CollectionSuggestion = {
  key: "desserts",
  matchCount: 3,
  recipeIds: ["d1", "d2", "d3"],
};

beforeEach(() => {
  refreshMock.mockReset();
  global.fetch = jest.fn();
});

describe("CollectionSuggestions", () => {
  it("renders a card with the localized name and matching count", () => {
    render(<CollectionSuggestions suggestions={[dessertSuggestion]} />);
    expect(screen.getByText("Desserts & Süßes")).toBeInTheDocument();
    expect(screen.getByText("3 passende Rezepte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sammlung erstellen" })).toBeInTheDocument();
  });

  it("shows no suggestion cards but offers the AI button when there are none", () => {
    render(<CollectionSuggestions suggestions={[]} />);
    expect(screen.queryByText("Desserts & Süßes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Weitere Ideen mit KI" })).toBeInTheDocument();
  });

  it("applies a suggestion: POSTs to the apply endpoint and removes the card", async () => {
    (global.fetch as jest.Mock).mockReturnValueOnce(okJson({ collection: { id: "c1" }, addedCount: 3 }));
    render(<CollectionSuggestions suggestions={[dessertSuggestion]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sammlung erstellen" }));

    await waitFor(() => expect(screen.queryByText("Desserts & Süßes")).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/collections/suggestions/apply",
      expect.objectContaining({ method: "POST" })
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ key: "desserts" });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("dismisses a suggestion: removes the card and POSTs to dismiss", async () => {
    (global.fetch as jest.Mock).mockReturnValueOnce(okJson(null));
    render(<CollectionSuggestions suggestions={[dessertSuggestion]} />);

    fireEvent.click(screen.getByRole("button", { name: "Vorschlag ausblenden" }));

    await waitFor(() => expect(screen.queryByText("Desserts & Süßes")).not.toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/collections/suggestions/dismiss",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("loads AI suggestions and renders them as cards", async () => {
    (global.fetch as jest.Mock).mockReturnValueOnce(
      okJson({ suggestions: [{ name: "Asiatische Küche", recipeIds: ["r1", "r2", "r3"] }] })
    );
    render(<CollectionSuggestions suggestions={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Weitere Ideen mit KI" }));

    expect(await screen.findByText("Asiatische Küche")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/collections/suggestions/ai",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error when applying fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "x" }) });
    render(<CollectionSuggestions suggestions={[dessertSuggestion]} />);

    fireEvent.click(screen.getByRole("button", { name: "Sammlung erstellen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sammlung konnte nicht erstellt werden."
    );
    expect(screen.getByText("Desserts & Süßes")).toBeInTheDocument();
  });
});
