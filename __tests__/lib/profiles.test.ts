jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: jest.fn(),
    auth: { admin: { getUserById: jest.fn(), listUsers: jest.fn() } },
  },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { getProfilesByIds, getProfileIdByEmail, profileDisplayName } from "@/lib/profiles";

const fromMock = supabaseAdmin.from as jest.Mock;
const getUserByIdMock = supabaseAdmin.auth.admin.getUserById as jest.Mock;
const listUsersMock = supabaseAdmin.auth.admin.listUsers as jest.Mock;

const TABLE_MISSING = { code: "42P01", message: 'relation "profiles" does not exist' };

/** profiles table query: select().in() resolving to `result` */
function makeInChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue(result),
  };
}

/** profiles table query: select().eq().maybeSingle() resolving to `result` */
function makeEqChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  getUserByIdMock.mockReset();
  listUsersMock.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("getProfilesByIds", () => {
  it("returns an empty map without querying for an empty id list", async () => {
    const result = await getProfilesByIds([]);
    expect(result.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("batch-resolves profiles from the profiles table", async () => {
    const rows = [
      { id: "u1", email: "a@example.com", display_name: "Anna" },
      { id: "u2", email: "b@example.com", display_name: null },
    ];
    const chain = makeInChain({ data: rows, error: null });
    fromMock.mockReturnValueOnce(chain);

    const result = await getProfilesByIds(["u1", "u2", "u1"]);

    expect(fromMock).toHaveBeenCalledWith("profiles");
    // Deduplicated ids in a single .in() call
    expect(chain.in).toHaveBeenCalledWith("id", ["u1", "u2"]);
    expect(result.get("u1")?.display_name).toBe("Anna");
    expect(result.get("u2")?.email).toBe("b@example.com");
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("falls back to auth.admin.getUserById when the table is missing (42P01)", async () => {
    fromMock.mockReturnValueOnce(makeInChain({ data: null, error: TABLE_MISSING }));
    getUserByIdMock.mockImplementation(async (id: string) => ({
      data: {
        user: { id, email: `${id}@Example.com`, user_metadata: { full_name: "Fallback Name" } },
      },
    }));

    const result = await getProfilesByIds(["u1", "u2"]);

    expect(getUserByIdMock).toHaveBeenCalledTimes(2);
    expect(result.get("u1")).toEqual({
      id: "u1",
      email: "u1@example.com",
      display_name: "Fallback Name",
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it("omits ids the fallback cannot resolve", async () => {
    fromMock.mockReturnValueOnce(makeInChain({ data: null, error: TABLE_MISSING }));
    getUserByIdMock.mockResolvedValue({ data: { user: null } });

    const result = await getProfilesByIds(["ghost"]);
    expect(result.size).toBe(0);
  });
});

describe("getProfileIdByEmail", () => {
  it("resolves the id from the profiles table (lowercased email)", async () => {
    const chain = makeEqChain({ data: { id: "u9" }, error: null });
    fromMock.mockReturnValueOnce(chain);

    const id = await getProfileIdByEmail("  Person@Example.COM ");

    expect(chain.eq).toHaveBeenCalledWith("email", "person@example.com");
    expect(id).toBe("u9");
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("returns null when no account exists", async () => {
    fromMock.mockReturnValueOnce(makeEqChain({ data: null, error: null }));
    expect(await getProfileIdByEmail("nobody@example.com")).toBeNull();
  });

  it("paginates through listUsers when the table is missing (fixes the 50-user ceiling)", async () => {
    fromMock.mockReturnValueOnce(makeEqChain({ data: null, error: TABLE_MISSING }));

    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `filler-${i}`,
      email: `filler-${i}@example.com`,
    }));
    listUsersMock
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({
        data: { users: [{ id: "target-id", email: "Target@example.com" }] },
        error: null,
      });

    const id = await getProfileIdByEmail("target@example.com");

    expect(id).toBe("target-id");
    expect(listUsersMock).toHaveBeenCalledTimes(2);
    expect(listUsersMock).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(listUsersMock).toHaveBeenCalledWith({ page: 2, perPage: 1000 });
  });

  it("stops paginating on a short page and returns null when not found", async () => {
    fromMock.mockReturnValueOnce(makeEqChain({ data: null, error: TABLE_MISSING }));
    listUsersMock.mockResolvedValueOnce({
      data: { users: [{ id: "u1", email: "other@example.com" }] },
      error: null,
    });

    const id = await getProfileIdByEmail("missing@example.com");

    expect(id).toBeNull();
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });
});

describe("profileDisplayName", () => {
  it("prefers display name, then email, then the fallback", () => {
    expect(
      profileDisplayName({ id: "u", email: "a@b.c", display_name: "Anna" }, "Unbekannt")
    ).toBe("Anna");
    expect(
      profileDisplayName({ id: "u", email: "a@b.c", display_name: null }, "Unbekannt")
    ).toBe("a@b.c");
    expect(profileDisplayName(undefined, "Unbekannt")).toBe("Unbekannt");
  });
});
