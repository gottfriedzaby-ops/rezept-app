import { NextRequest } from "next/server";

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

import { middleware, config } from "@/middleware";
import { createServerClient } from "@supabase/ssr";

const createServerClientMock = createServerClient as jest.Mock;
const getUserMock = jest.fn();

function makeRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

function setAuthenticated(userId = "u1") {
  getUserMock.mockResolvedValue({ data: { user: { id: userId } } });
}

function setUnauthenticated() {
  getUserMock.mockResolvedValue({ data: { user: null } });
}

/** A redirect response has a Location header; pass-through (NextResponse.next) does not. */
function locationOf(res: Response): string | null {
  return res.headers.get("location");
}

function isRedirect(res: Response): boolean {
  return locationOf(res) !== null;
}

beforeEach(() => {
  createServerClientMock.mockReset();
  getUserMock.mockReset();
  createServerClientMock.mockReturnValue({
    auth: { getUser: getUserMock },
  });
});

describe("middleware — unauthenticated access to protected routes", () => {
  // MW-01
  it("redirects unauthenticated user from / to /login", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/"));
    expect(isRedirect(res)).toBe(true);
    const loc = locationOf(res)!;
    expect(loc).toMatch(/\/login$/); // no redirect param for root
  });

  // MW-02
  it("preserves the original path as ?redirect= when bouncing to /login", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/recipes/abc"));
    const loc = locationOf(res)!;
    const url = new URL(loc);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("redirect")).toBe("/recipes/abc");
  });

  // MW-03
  it("does NOT add a redirect param when the source path is /", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/"));
    const loc = locationOf(res)!;
    const url = new URL(loc);
    expect(url.searchParams.has("redirect")).toBe(false);
  });
});

describe("middleware — authenticated access", () => {
  // MW-04
  it("lets an authenticated user through to a protected route", async () => {
    setAuthenticated();
    const res = await middleware(makeRequest("/recipes"));
    expect(isRedirect(res)).toBe(false);
  });
});

describe("middleware — public routes (no auth required)", () => {
  // MW-05
  it("allows unauthenticated access to /login", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/login"));
    expect(isRedirect(res)).toBe(false);
  });

  // MW-06
  it("allows unauthenticated access to /register", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/register"));
    expect(isRedirect(res)).toBe(false);
  });

  // MW-07
  it("allows unauthenticated access to /auth/callback", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/auth/callback"));
    expect(isRedirect(res)).toBe(false);
  });

  // MW-08
  it("allows unauthenticated access to /shared/<token>", async () => {
    setUnauthenticated();
    const res = await middleware(makeRequest("/shared/abc123"));
    expect(isRedirect(res)).toBe(false);
  });

  it("allows unauthenticated GET to /api/library-shares/invitation/<token>", async () => {
    setUnauthenticated();
    const res = await middleware(
      makeRequest("/api/library-shares/invitation/abc123")
    );
    expect(isRedirect(res)).toBe(false);
  });
});

describe("middleware — logged-in users on auth pages", () => {
  // MW-09
  it("redirects an authenticated user away from /login to /", async () => {
    setAuthenticated();
    const res = await middleware(makeRequest("/login"));
    expect(isRedirect(res)).toBe(true);
    const url = new URL(locationOf(res)!);
    expect(url.pathname).toBe("/");
  });

  // MW-10
  it("redirects an authenticated user away from /register to /", async () => {
    setAuthenticated();
    const res = await middleware(makeRequest("/register"));
    expect(isRedirect(res)).toBe(true);
    const url = new URL(locationOf(res)!);
    expect(url.pathname).toBe("/");
  });
});

describe("middleware — session handling", () => {
  // MW-11
  it("calls supabase.auth.getUser() exactly once per request", async () => {
    setAuthenticated();
    await middleware(makeRequest("/recipes"));
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it("calls supabase.auth.getUser() even for public routes (so session is refreshed)", async () => {
    setUnauthenticated();
    await middleware(makeRequest("/login"));
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });
});

describe("middleware — config.matcher (static assets bypass)", () => {
  // MW-12: verify the matcher's regex excludes static asset paths.
  // The matcher pattern uses negative lookahead — we evaluate it as a real RegExp
  // to sanity-check the exclusions.
  const matcherRe = new RegExp(
    "^/(?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*$"
  );

  it("middleware config exports a matcher", () => {
    expect(config.matcher).toBeDefined();
    expect(config.matcher[0]).toContain("_next/static");
    expect(config.matcher[0]).toContain("_next/image");
    expect(config.matcher[0]).toContain("favicon.ico");
  });

  it.each([
    "/_next/static/chunk.js",
    "/_next/image?url=foo",
    "/favicon.ico",
    "/logo.png",
    "/icon.svg",
    "/photo.jpeg",
  ])("does not match static asset path %s", (path) => {
    expect(matcherRe.test(path)).toBe(false);
  });

  it.each(["/", "/recipes", "/login", "/api/recipes/abc"])(
    "matches application route %s",
    (path) => {
      expect(matcherRe.test(path)).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// Cookie forwarding (setAll / getAll) — when Supabase SSR refreshes the
// session, the cookies it writes via setAll must end up on the final response.
// ---------------------------------------------------------------------------

describe("middleware — Supabase SSR cookie callbacks", () => {
  it("getAll returns the request's cookies", async () => {
    let capturedGetAll: (() => unknown) | null = null;
    createServerClientMock.mockImplementationOnce((_url, _key, opts) => {
      capturedGetAll = opts.cookies.getAll;
      return {
        auth: {
          getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
        },
      };
    });

    const req = makeRequest("/recipes");
    req.cookies.set("flavour", "vanilla");

    await middleware(req);

    expect(capturedGetAll).not.toBeNull();
    const all = (capturedGetAll as unknown as () => Array<{ name: string; value: string }>)();
    const names = all.map((c) => c.name);
    expect(names).toContain("flavour");
  });

  it("setAll: cookies written by Supabase SSR appear on the response", async () => {
    let capturedSetAll:
      | ((cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void)
      | null = null;
    createServerClientMock.mockImplementationOnce((_url, _key, opts) => {
      capturedSetAll = opts.cookies.setAll;
      return {
        auth: {
          getUser: jest.fn().mockImplementation(async () => {
            // Simulate Supabase SSR refreshing the session mid-flight
            capturedSetAll!([
              { name: "sb-access-token", value: "new-token", options: {} },
              { name: "sb-refresh-token", value: "new-refresh", options: {} },
            ]);
            return { data: { user: { id: "u1" } } };
          }),
        },
      };
    });

    const res = await middleware(makeRequest("/recipes"));

    expect(res.cookies.get("sb-access-token")?.value).toBe("new-token");
    expect(res.cookies.get("sb-refresh-token")?.value).toBe("new-refresh");
  });
});
