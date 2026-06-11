import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CollectionPicker from "@/components/CollectionPicker";

const RECIPE_ID = "r1";

type PickerRow = {
  id: string;
  created_at: string;
  user_id: string;
  name: string;
  recipe_count: number;
  contains_recipe: boolean;
};

function makeCollection(overrides: Partial<PickerRow> = {}): PickerRow {
  return {
    id: "c1",
    created_at: "2026-06-11T00:00:00Z",
    user_id: "u1",
    name: "Sommer",
    recipe_count: 2,
    contains_recipe: true,
    ...overrides,
  };
}

function jsonResponse(data: unknown, init: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = init;
  return {
    ok,
    status,
    json: async () => ({ data: ok ? data : null, error: ok ? null : "kaputt" }),
  };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Zu Sammlung hinzufügen" }));
}

describe("CollectionPicker", () => {
  it("opens the modal and lists the fetched collections with their checked state", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse([
        makeCollection(),
        makeCollection({ id: "c2", name: "Winter", contains_recipe: false }),
      ])
    );

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    const dialog = await screen.findByRole("dialog", { name: "In Sammlungen speichern" });
    expect(dialog).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/collections?recipe_id=r1");

    expect(await screen.findByRole("checkbox", { name: "Sommer" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Winter" })).not.toBeChecked();
  });

  it("shows the empty state when there are no collections", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    expect(
      await screen.findByText("Noch keine Sammlungen — lege unten deine erste an.")
    ).toBeInTheDocument();
  });

  it("POSTs the membership when checking an unchecked collection", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse([makeCollection({ id: "c2", name: "Winter", contains_recipe: false })])
      )
      .mockResolvedValueOnce(jsonResponse({ collection_id: "c2", recipe_id: RECIPE_ID }));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    await user.click(await screen.findByRole("checkbox", { name: "Winter" }));

    expect(global.fetch).toHaveBeenLastCalledWith("/api/collections/c2/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: RECIPE_ID }),
    });
    expect(screen.getByRole("checkbox", { name: "Winter" })).toBeChecked();
  });

  it("DELETEs the membership when unchecking a checked collection", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse([makeCollection()]))
      .mockResolvedValueOnce(jsonResponse(null));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    await user.click(await screen.findByRole("checkbox", { name: "Sommer" }));

    expect(global.fetch).toHaveBeenLastCalledWith("/api/collections/c1/recipes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: RECIPE_ID }),
    });
    expect(screen.getByRole("checkbox", { name: "Sommer" })).not.toBeChecked();
  });

  it("reverts the toggle and shows an error when the request fails", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        jsonResponse([makeCollection({ id: "c2", name: "Winter", contains_recipe: false })])
      )
      .mockResolvedValueOnce(jsonResponse(null, { ok: false, status: 500 }));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    await user.click(await screen.findByRole("checkbox", { name: "Winter" }));

    expect(
      await screen.findByText("Aktion fehlgeschlagen. Bitte erneut versuchen.")
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Winter" })).not.toBeChecked();
  });

  it("creates a new collection and refetches the list", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(makeCollection({ name: "Neu" }), { status: 201 }))
      .mockResolvedValueOnce(
        jsonResponse([makeCollection({ name: "Neu", contains_recipe: false, recipe_count: 0 })])
      );

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    await user.type(await screen.findByPlaceholderText("Neue Sammlung …"), "Neu");
    await user.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Neu" })).toBeInTheDocument()
    );

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][0]).toBe("/api/collections");
    expect(calls[1][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "Neu" }),
    });
    expect(calls[2][0]).toBe("/api/collections?recipe_id=r1");
  });

  it("shows the duplicate-name error on a 409", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse([makeCollection()]))
      .mockResolvedValueOnce(jsonResponse(null, { ok: false, status: 409 }));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    await user.type(await screen.findByPlaceholderText("Neue Sammlung …"), "Sommer");
    await user.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(
      await screen.findByText("Eine Sammlung mit diesem Namen existiert bereits.")
    ).toBeInTheDocument();
  });

  it("shows the load error and retries on click", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse([makeCollection()]));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);

    const retry = await screen.findByRole("button", {
      name: "Sammlungen konnten nicht geladen werden.",
    });
    await user.click(retry);

    expect(await screen.findByRole("checkbox", { name: "Sommer" })).toBeChecked();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("closes the modal via the close button", async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));

    render(<CollectionPicker recipeId={RECIPE_ID} />);
    await openPicker(user);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Fertig" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
