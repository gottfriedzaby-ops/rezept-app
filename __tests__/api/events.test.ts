import { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

import { POST } from "@/app/api/events/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fromMock = supabaseAdmin.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const USER_ID = "user-1";
const EVENT_ID = "11111111-2222-3333-4444-555555555555";

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

function makeRequest(body: object = {}) {
  return new NextRequest("http://localhost/api/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    event_name: "recipe_search",
    properties: { result_count: 5, favorites_only: false, has_tag_filter: true },
    path: "/recipe/[id]",
    locale: "de",
    session_id: "sess-1",
    client_ts: "2026-07-07T10:00:00.000Z",
    ...overrides,
  };
}

/** user_settings: select().eq().maybeSingle() */
function makeConsentChain(result: { data: unknown; error?: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ error: null, ...result }),
  };
}

/** interaction_events count: select(*,{count,head}).eq().gte() */
function makeCountChain(count: number, error: unknown = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue({ count, error }),
  };
}

/** interaction_events upsert() */
function makeUpsertChain(result: { error: unknown }) {
  return { upsert: jest.fn().mockResolvedValue(result) };
}

beforeEach(() => {
  fromMock.mockReset();
  serverClientMock.mockReset();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("POST /api/events", () => {
  it("returns 401 when unauthenticated and never touches the db", async () => {
    setUnauthenticated();
    const res = await POST(makeRequest({ events: [makeEvent()] }));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("drops the batch (accepted:0) when consent is off, without upserting", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: false } }));
    const res = await POST(makeRequest({ events: [makeEvent()] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(0);
    // only the consent read happened — no count, no upsert
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("inserts valid events, stamping category + user_id and using an idempotent upsert", async () => {
    setAuthenticated();
    const upsert = makeUpsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }))
      .mockReturnValueOnce(makeCountChain(0))
      .mockReturnValueOnce(upsert);

    const res = await POST(makeRequest({ events: [makeEvent()] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(1);

    const [rows, options] = upsert.upsert.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_ID);
    expect(rows[0].event_name).toBe("recipe_search");
    expect(rows[0].event_category).toBe("search"); // server-stamped
    expect(options).toEqual({ onConflict: "id", ignoreDuplicates: true });
  });

  it("proceeds with the default (opt-out) when no settings row exists", async () => {
    setAuthenticated();
    const upsert = makeUpsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: null }))
      .mockReturnValueOnce(makeCountChain(0))
      .mockReturnValueOnce(upsert);

    const res = await POST(makeRequest({ events: [makeEvent()] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(1);
  });

  it("filters out invalid events and sanitizes fields", async () => {
    setAuthenticated();
    const upsert = makeUpsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }))
      .mockReturnValueOnce(makeCountChain(0))
      .mockReturnValueOnce(upsert);

    const res = await POST(
      makeRequest({
        events: [
          makeEvent({ id: "not-a-uuid" }), // dropped: bad id
          makeEvent({ event_name: "totally_made_up" }), // dropped: unknown name
          makeEvent({ properties: "a string" }), // kept, properties -> null
          makeEvent({ path: "/search?q=secret" }), // kept, query stripped
        ],
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(2);

    const rows = upsert.upsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    // non-object properties become null
    expect(rows.find((r: { properties: unknown }) => r.properties === null)).toBeTruthy();
    // query string stripped from path
    expect(rows.some((r: { path: string | null }) => r.path === "/search")).toBe(true);
    expect(rows.every((r: { path: string | null }) => !String(r.path).includes("?"))).toBe(true);
  });

  it("caps the batch at 100 events", async () => {
    setAuthenticated();
    const upsert = makeUpsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }))
      .mockReturnValueOnce(makeCountChain(0))
      .mockReturnValueOnce(upsert);

    const events = Array.from({ length: 150 }, (_, i) =>
      makeEvent({ id: `${"0".repeat(8)}-0000-4000-8000-${String(i).padStart(12, "0")}` }),
    );
    const res = await POST(makeRequest({ events }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBeLessThanOrEqual(100);
    expect(upsert.upsert.mock.calls[0][0].length).toBeLessThanOrEqual(100);
  });

  it("returns 200 accepted:0 for an empty batch without counting or upserting", async () => {
    setAuthenticated();
    fromMock.mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }));
    const res = await POST(makeRequest({ events: [] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(0);
    expect(fromMock).toHaveBeenCalledTimes(1); // consent only
  });

  it("drops the batch when the per-user daily cap is exceeded", async () => {
    setAuthenticated();
    const upsert = makeUpsertChain({ error: null });
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }))
      .mockReturnValueOnce(makeCountChain(5000))
      .mockReturnValueOnce(upsert);

    const res = await POST(makeRequest({ events: [makeEvent()] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(0);
    expect(upsert.upsert).not.toHaveBeenCalled();
  });

  it("returns 503 when the table is missing (42P01)", async () => {
    setAuthenticated();
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }))
      .mockReturnValueOnce(makeCountChain(0))
      .mockReturnValueOnce(makeUpsertChain({ error: { code: "42P01" } }));

    const res = await POST(makeRequest({ events: [makeEvent()] }));
    expect(res.status).toBe(503);
  });

  it("fails open (200 accepted:0) on an unexpected insert error", async () => {
    setAuthenticated();
    fromMock
      .mockReturnValueOnce(makeConsentChain({ data: { analytics_enabled: true } }))
      .mockReturnValueOnce(makeCountChain(0))
      .mockReturnValueOnce(makeUpsertChain({ error: { code: "23505", message: "boom" } }));

    const res = await POST(makeRequest({ events: [makeEvent()] }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.accepted).toBe(0);
  });
});
