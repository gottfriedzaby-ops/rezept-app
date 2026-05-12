import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { GET } from "@/app/auth/callback/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";

const createServerClientMock = createSupabaseServerClient as jest.Mock;
const fromMock = supabaseAdmin.from as jest.Mock;

const exchangeMock = jest.fn();
const getUserMock = jest.fn();

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/auth/callback${query}`);
}

function locationOf(res: Response): string {
  return res.headers.get("location") ?? "";
}

/** library_shares update().eq().is() chain — terminal call returns nothing meaningful. */
function makeClaimChain() {
  return {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
}

beforeEach(() => {
  createServerClientMock.mockReset();
  fromMock.mockReset();
  exchangeMock.mockReset();
  getUserMock.mockReset();
  createServerClientMock.mockResolvedValue({
    auth: {
      exchangeCodeForSession: exchangeMock,
      getUser: getUserMock,
    },
  });
});

describe("GET /auth/callback", () => {
  // CB-01
  it("redirects to {origin}/{next} on successful code exchange", async () => {
    exchangeMock.mockResolvedValueOnce({ error: null });

    const res = await GET(makeRequest("?code=abc&next=/recipes"));

    expect(exchangeMock).toHaveBeenCalledWith("abc");
    expect(locationOf(res)).toBe("http://localhost/recipes");
  });

  // CB-02
  it("redirects to {origin}/ when next is absent", async () => {
    exchangeMock.mockResolvedValueOnce({ error: null });

    const res = await GET(makeRequest("?code=abc"));

    expect(locationOf(res)).toBe("http://localhost/");
  });

  // CB-03
  it("redirects to /login?error=auth_callback_failed when code is missing", async () => {
    const res = await GET(makeRequest(""));

    expect(exchangeMock).not.toHaveBeenCalled();
    expect(locationOf(res)).toBe(
      "http://localhost/login?error=auth_callback_failed"
    );
  });

  // CB-04
  it("redirects to /login?error=auth_callback_failed when code exchange fails", async () => {
    exchangeMock.mockResolvedValueOnce({ error: { message: "invalid code" } });

    const res = await GET(makeRequest("?code=bad"));

    expect(locationOf(res)).toBe(
      "http://localhost/login?error=auth_callback_failed"
    );
  });

  // Extra: invitation token handling
  it("claims a pending library-share invitation when ?invitation= is present and exchange succeeds", async () => {
    exchangeMock.mockResolvedValueOnce({ error: null });
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "new-user" } } });
    const chain = makeClaimChain();
    fromMock.mockReturnValueOnce(chain);

    const res = await GET(makeRequest("?code=abc&invitation=invite-token"));

    expect(fromMock).toHaveBeenCalledWith("library_shares");
    expect((chain.update as jest.Mock).mock.calls[0][0]).toEqual({
      recipient_id: "new-user",
      invitation_token: null,
    });
    expect((chain.eq as jest.Mock).mock.calls[0]).toEqual([
      "invitation_token",
      "invite-token",
    ]);
    expect((chain.is as jest.Mock).mock.calls[0]).toEqual([
      "recipient_id",
      null,
    ]);
    expect(locationOf(res)).toBe("http://localhost/library-shares/incoming");
  });

  it("does not attempt to claim an invitation if the user is missing after exchange", async () => {
    exchangeMock.mockResolvedValueOnce({ error: null });
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    const res = await GET(makeRequest("?code=abc&invitation=invite-token"));

    expect(fromMock).not.toHaveBeenCalled();
    // Still redirects to the incoming page — by design, the user always lands
    // there when an invitation token is present, even if the claim couldn't run.
    expect(locationOf(res)).toBe("http://localhost/library-shares/incoming");
  });
});
