import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/recipe-search", () => {
  const actual = jest.requireActual("@/lib/recipe-search");
  return {
    ...actual,
    searchRecipes: jest.fn(),
    getSharedOwnerIds: jest.fn(),
  };
});

jest.mock("@/lib/profiles", () => {
  const actual = jest.requireActual("@/lib/profiles");
  return {
    ...actual,
    getProfilesByIds: jest.fn(),
  };
});

import { GET } from "@/app/api/recipes/search/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchRecipes, getSharedOwnerIds } from "@/lib/recipe-search";
import { getProfilesByIds } from "@/lib/profiles";

const serverClientMock = createSupabaseServerClient as jest.Mock;
const searchRecipesMock = searchRecipes as jest.Mock;
const getSharedOwnerIdsMock = getSharedOwnerIds as jest.Mock;
const getProfilesByIdsMock = getProfilesByIds as jest.Mock;

const USER_ID = "user-1";

function setAuthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
  });
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  });
}

function makeRequest(qs = "") {
  return new NextRequest(`http://localhost/api/recipes/search${qs}`, { method: "GET" });
}

beforeEach(() => {
  serverClientMock.mockReset();
  searchRecipesMock.mockReset();
  getSharedOwnerIdsMock.mockReset();
  getSharedOwnerIdsMock.mockResolvedValue([]);
  getProfilesByIdsMock.mockReset();
  getProfilesByIdsMock.mockResolvedValue(new Map());
});

describe("GET /api/recipes/search", () => {
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(searchRecipesMock).not.toHaveBeenCalled();
  });

  it("parses all query params and forwards them to searchRecipes", async () => {
    setAuthenticated();
    getSharedOwnerIdsMock.mockResolvedValueOnce(["owner-a"]);
    searchRecipesMock.mockResolvedValueOnce({
      recipes: [], total: 0, offset: 24, limit: 24,
    });

    const res = await GET(
      makeRequest("?q=kuchen&tag=backen&tag=süß&fav=1&sort=time&offset=24&limit=12")
    );

    expect(res.status).toBe(200);
    expect(searchRecipesMock).toHaveBeenCalledWith(USER_ID, ["owner-a"], {
      q: "kuchen",
      tags: ["backen", "süß"],
      favoritesOnly: true,
      sort: "time",
      offset: 24,
      limit: 12,
    });
  });

  it("attaches owner names to shared recipes only", async () => {
    setAuthenticated();
    searchRecipesMock.mockResolvedValueOnce({
      recipes: [
        { id: "own", user_id: USER_ID, title: "Meins" },
        { id: "foreign", user_id: "owner-a", title: "Geteilt" },
      ],
      total: 2,
      offset: 0,
      limit: 24,
    });
    getProfilesByIdsMock.mockResolvedValueOnce(
      new Map([["owner-a", { id: "owner-a", email: "a@b.c", display_name: "Anna" }]])
    );

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(getProfilesByIdsMock).toHaveBeenCalledWith(["owner-a"]);
    expect(body.data.recipes[0]._ownerName).toBeUndefined();
    expect(body.data.recipes[1]._ownerName).toBe("Anna");
  });

  it("returns 500 with the error message when the search throws", async () => {
    setAuthenticated();
    searchRecipesMock.mockRejectedValueOnce(new Error("kaputt"));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("kaputt");
  });
});
