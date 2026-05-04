import { NextRequest } from "next/server";
import { PATCH, DELETE } from "@/app/api/recipes/[id]/route";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  }),
}));

import { supabaseAdmin } from "@/lib/supabase";

const fromMock = supabaseAdmin.from as jest.Mock;
const storageFromMock = supabaseAdmin.storage.from as jest.Mock;

const RECIPE_ID = "recipe-uuid-123";

function makeParams() {
  return { params: { id: RECIPE_ID } };
}

function makePatchRequest(body: object) {
  return new NextRequest(`http://localhost/api/recipes/${RECIPE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeDeleteRequest() {
  return new NextRequest(`http://localhost/api/recipes/${RECIPE_ID}`, {
    method: "DELETE",
  });
}

function makeUpdateChain(result: { data: unknown; error: unknown }) {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function makeSelectChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

function makeDeleteChain(result: { error: unknown }) {
  return {
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  storageFromMock.mockReset();

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
});

describe("PATCH /api/recipes/[id]", () => {
  it("returns 400 when no updatable fields are sent", async () => {
    const req = makePatchRequest({});
    const res = await PATCH(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it("updates a single field (title)", async () => {
    const updated = { id: RECIPE_ID, title: "Neuer Titel" };
    fromMock.mockReturnValue(makeUpdateChain({ data: updated, error: null }));

    const req = makePatchRequest({ title: "Neuer Titel" });
    const res = await PATCH(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(updated);
    expect(body.error).toBeNull();
  });

  it("updates favorite field", async () => {
    fromMock.mockReturnValue(makeUpdateChain({ data: { id: RECIPE_ID, favorite: true }, error: null }));

    const req = makePatchRequest({ favorite: true });
    const res = await PATCH(req, makeParams());

    expect(res.status).toBe(200);
  });

  it("syncs flat ingredients/steps when sections are updated", async () => {
    const updateMock = jest.fn().mockReturnThis();
    const eqMock = jest.fn().mockReturnThis();
    const selectMock = jest.fn().mockReturnThis();
    const singleMock = jest.fn().mockResolvedValue({ data: { id: RECIPE_ID }, error: null });

    fromMock.mockReturnValue({
      update: updateMock,
      eq: eqMock,
      select: selectMock,
      single: singleMock,
    });

    const sections = [
      {
        title: null,
        ingredients: [{ amount: 100, unit: "g", name: "Mehl" }],
        steps: [{ order: 1, text: "Mehl sieben.", timerSeconds: null }],
      },
    ];

    const req = makePatchRequest({ sections });
    await PATCH(req, makeParams());

    const updateArg = updateMock.mock.calls[0][0];
    expect(updateArg.sections).toEqual(sections);
    expect(updateArg.ingredients).toEqual([{ amount: 100, unit: "g", name: "Mehl" }]);
    expect(updateArg.steps[0].order).toBe(1);
  });

  it("returns 500 when the database update fails", async () => {
    fromMock.mockReturnValue(makeUpdateChain({ data: null, error: { message: "DB error" } }));

    const req = makePatchRequest({ title: "Test" });
    const res = await PATCH(req, makeParams());

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/recipes/[id]", () => {
  it("deletes a recipe without an image", async () => {
    fromMock
      .mockReturnValueOnce(makeSelectChain({ data: { image_url: null }, error: null }))
      .mockReturnValueOnce(makeDeleteChain({ error: null }));

    const req = makeDeleteRequest();
    const res = await DELETE(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    // Storage should NOT be touched
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("removes image from storage when image_url is a Supabase storage URL", async () => {
    const imageUrl = `https://test.supabase.co/storage/v1/object/public/recipe-images/my-image.jpg`;
    const removeMock = jest.fn().mockResolvedValue({ data: null, error: null });
    storageFromMock.mockReturnValue({ remove: removeMock });

    fromMock
      .mockReturnValueOnce(makeSelectChain({ data: { image_url: imageUrl }, error: null }))
      .mockReturnValueOnce(makeDeleteChain({ error: null }));

    const req = makeDeleteRequest();
    await DELETE(req, makeParams());

    expect(storageFromMock).toHaveBeenCalledWith("recipe-images");
    expect(removeMock).toHaveBeenCalledWith(["my-image.jpg"]);
  });

  it("does not touch storage when image_url is an external URL", async () => {
    fromMock
      .mockReturnValueOnce(
        makeSelectChain({ data: { image_url: "https://cdn.example.com/photo.jpg" }, error: null })
      )
      .mockReturnValueOnce(makeDeleteChain({ error: null }));

    const req = makeDeleteRequest();
    await DELETE(req, makeParams());

    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("returns 500 when database deletion fails", async () => {
    fromMock
      .mockReturnValueOnce(makeSelectChain({ data: { image_url: null }, error: null }))
      .mockReturnValueOnce(makeDeleteChain({ error: { message: "Cannot delete" } }));

    const req = makeDeleteRequest();
    const res = await DELETE(req, makeParams());

    expect(res.status).toBe(500);
  });
});
