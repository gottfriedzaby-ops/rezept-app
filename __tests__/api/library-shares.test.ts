import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: jest.fn(),
    auth: {
      admin: {
        getUserById: jest.fn(),
        listUsers: jest.fn(),
      },
    },
  },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/invitation-rate-limit", () => ({
  checkDailyInvitationLimit: jest.fn(),
  invitationRateLimitErrorMessage: jest
    .fn()
    .mockReturnValue("Einladungslimit erreicht."),
}));

jest.mock("@/lib/email", () => ({
  sendInvitationToRegistered: jest.fn(),
  sendInvitationToUnregistered: jest.fn(),
}));

import { GET, POST } from "@/app/api/library-shares/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkDailyInvitationLimit } from "@/lib/invitation-rate-limit";
import {
  sendInvitationToRegistered,
  sendInvitationToUnregistered,
} from "@/lib/email";

const fromMock = supabaseAdmin.from as jest.Mock;
const getUserByIdMock = supabaseAdmin.auth.admin.getUserById as jest.Mock;
const listUsersMock = supabaseAdmin.auth.admin.listUsers as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;
const checkInvitationLimitMock = checkDailyInvitationLimit as jest.Mock;
const sendRegisteredMock = sendInvitationToRegistered as jest.Mock;
const sendUnregisteredMock = sendInvitationToUnregistered as jest.Mock;

const OWNER_ID = "owner-uuid";
const OWNER_EMAIL = "owner@example.com";

function setAuthenticated(opts: { id?: string; email?: string; meta?: Record<string, unknown> } = {}) {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: {
            id: opts.id ?? OWNER_ID,
            email: opts.email ?? OWNER_EMAIL,
            user_metadata: opts.meta ?? null,
          },
        },
      }),
    },
  });
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  });
}

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/library-shares", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** GET: select().eq().neq().order() */
function makeListChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
  };
}

/** POST: existing-share lookup — select().eq().eq().neq().maybeSingle() */
function makeExistingShareChain(result: { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

/** POST: insert chain — insert().select().single() */
function makeInsertChain(result: { data: unknown; error: unknown }) {
  return {
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  fromMock.mockReset();
  getUserByIdMock.mockReset();
  listUsersMock.mockReset();
  serverClientMock.mockReset();
  checkInvitationLimitMock.mockReset();
  sendRegisteredMock.mockReset();
  sendUnregisteredMock.mockReset();

  // Sane defaults so individual tests only override what matters
  checkInvitationLimitMock.mockResolvedValue({
    allowed: true,
    count: 0,
    remaining: 5,
  });
  listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
  sendRegisteredMock.mockResolvedValue({ success: true });
  sendUnregisteredMock.mockResolvedValue({ success: true });
});

// ---------------------------------------------------------------------------
// GET /api/library-shares
// ---------------------------------------------------------------------------

describe("GET /api/library-shares", () => {
  // LS-01
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  // LS-02
  it("returns an enriched list of shares with recipient display names", async () => {
    setAuthenticated();
    const rawShares = [
      {
        id: "s1",
        owner_id: OWNER_ID,
        recipient_id: "rec-1",
        recipient_email: "alice@example.com",
        status: "accepted",
        invited_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "s2",
        owner_id: OWNER_ID,
        recipient_id: "rec-2",
        recipient_email: "bob@example.com",
        status: "pending",
        invited_at: "2026-02-01T00:00:00Z",
      },
    ];
    fromMock.mockReturnValueOnce(makeListChain({ data: rawShares, error: null }));

    getUserByIdMock
      .mockResolvedValueOnce({
        data: { user: { email: "alice@example.com", user_metadata: { full_name: "Alice" } } },
      })
      .mockResolvedValueOnce({
        data: { user: { email: "bob@example.com", user_metadata: null } },
      });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].recipient_display_name).toBe("Alice");
    expect(body.data[1].recipient_display_name).toBe("bob@example.com"); // falls back to email
  });

  // LS-03
  it("returns recipient_display_name=null for shares with no recipient_id", async () => {
    setAuthenticated();
    const rawShares = [
      {
        id: "s1",
        owner_id: OWNER_ID,
        recipient_id: null,
        recipient_email: "pending@example.com",
        status: "pending",
        invited_at: "2026-03-01T00:00:00Z",
      },
    ];
    fromMock.mockReturnValueOnce(makeListChain({ data: rawShares, error: null }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].recipient_display_name).toBeNull();
    expect(getUserByIdMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the DB list query errors", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeListChain({ data: null, error: { message: "DB fail" } })
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("DB fail");
  });
});

// ---------------------------------------------------------------------------
// POST /api/library-shares
// ---------------------------------------------------------------------------

describe("POST /api/library-shares", () => {
  // LS-04
  it("returns 401 when unauthenticated", async () => {
    setUnauthenticated();

    const res = await POST(makeRequest({ recipient_email: "x@y.com" }));
    expect(res.status).toBe(401);
  });

  // LS-05
  it("returns 400 when the recipient email is invalid", async () => {
    setAuthenticated();

    const res = await POST(makeRequest({ recipient_email: "not-an-email" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/gültige E-Mail-Adresse/);
  });

  // LS-06
  it("returns 400 when the user tries to share with themselves", async () => {
    setAuthenticated({ email: OWNER_EMAIL });

    const res = await POST(makeRequest({ recipient_email: OWNER_EMAIL }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/dir selbst/);
  });

  // LS-07
  it("returns 400 when a non-revoked share already exists for this owner+email", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeExistingShareChain({
        data: { id: "existing-id", status: "pending" },
        error: null,
      })
    );

    const res = await POST(makeRequest({ recipient_email: "alice@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/bereits eine Einladung/);
  });

  // LS-08
  it("returns 429 when the daily invitation rate limit is reached", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeExistingShareChain({ data: null, error: null })
    );
    checkInvitationLimitMock.mockResolvedValueOnce({
      allowed: false,
      count: 5,
      remaining: 0,
    });

    const res = await POST(makeRequest({ recipient_email: "alice@example.com" }));
    expect(res.status).toBe(429);
  });

  // LS-09
  it("creates the share and sends the registered-recipient email when the recipient already has an account", async () => {
    setAuthenticated({ meta: { full_name: "Owner Name" } });
    fromMock.mockReturnValueOnce(
      makeExistingShareChain({ data: null, error: null })
    );
    listUsersMock.mockResolvedValueOnce({
      data: {
        users: [{ id: "recipient-uuid", email: "alice@example.com" }],
      },
      error: null,
    });
    fromMock.mockReturnValueOnce(
      makeInsertChain({
        data: { id: "new-share", recipient_id: "recipient-uuid" },
        error: null,
      })
    );

    const res = await POST(makeRequest({ recipient_email: "alice@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.recipient_id).toBe("recipient-uuid");
    expect(sendRegisteredMock).toHaveBeenCalledTimes(1);
    expect(sendRegisteredMock).toHaveBeenCalledWith({
      ownerName: "Owner Name",
      recipientEmail: "alice@example.com",
    });
    expect(sendUnregisteredMock).not.toHaveBeenCalled();
  });

  // LS-10
  it("creates the share and sends the unregistered-recipient email (with invitation token) when the recipient has no account", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeExistingShareChain({ data: null, error: null })
    );
    // listUsersMock default in beforeEach already returns no matching users
    const insertChain = makeInsertChain({
      data: { id: "new-share", recipient_id: null },
      error: null,
    });
    fromMock.mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest({ recipient_email: "newperson@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.recipient_id).toBeNull();
    expect(sendUnregisteredMock).toHaveBeenCalledTimes(1);
    const call = sendUnregisteredMock.mock.calls[0][0];
    expect(call.recipientEmail).toBe("newperson@example.com");
    expect(typeof call.invitationToken).toBe("string");
    expect(call.invitationToken.length).toBeGreaterThan(0);
    expect(sendRegisteredMock).not.toHaveBeenCalled();

    // Verify the insert payload includes the same token + owner_id
    const insertCall = (insertChain.insert as jest.Mock).mock.calls[0][0];
    expect(insertCall.owner_id).toBe(OWNER_ID);
    expect(insertCall.recipient_email).toBe("newperson@example.com");
    expect(insertCall.status).toBe("pending");
    expect(insertCall.recipient_id).toBeNull();
    expect(insertCall.invitation_token).toBe(call.invitationToken);
  });

  // LS-11
  it("returns 500 when the DB insert fails", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeExistingShareChain({ data: null, error: null })
    );
    fromMock.mockReturnValueOnce(
      makeInsertChain({ data: null, error: { message: "Insert failed" } })
    );

    const res = await POST(makeRequest({ recipient_email: "alice@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Insert failed");
  });

  // LS-12
  it("still returns 201 when the email send fails (non-blocking)", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(
      makeExistingShareChain({ data: null, error: null })
    );
    listUsersMock.mockResolvedValueOnce({
      data: { users: [{ id: "recipient-uuid", email: "alice@example.com" }] },
      error: null,
    });
    fromMock.mockReturnValueOnce(
      makeInsertChain({
        data: { id: "new-share", recipient_id: "recipient-uuid" },
        error: null,
      })
    );
    sendRegisteredMock.mockResolvedValueOnce({
      success: false,
      error: "Resend down",
    });

    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(makeRequest({ recipient_email: "alice@example.com" }));

    expect(res.status).toBe(201);
    consoleError.mockRestore();
  });

  it("normalises the recipient email to lowercase and trims whitespace", async () => {
    setAuthenticated();
    const existing = makeExistingShareChain({ data: null, error: null });
    fromMock.mockReturnValueOnce(existing);
    fromMock.mockReturnValueOnce(
      makeInsertChain({ data: { id: "x", recipient_id: null }, error: null })
    );

    await POST(makeRequest({ recipient_email: "  ALICE@Example.COM  " }));

    // The existing-share check is filtered by the normalised email
    expect((existing.eq as jest.Mock).mock.calls).toContainEqual([
      "recipient_email",
      "alice@example.com",
    ]);
  });
});
