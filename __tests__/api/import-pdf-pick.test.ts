import { NextRequest } from "next/server";

jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn(),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

jest.mock("@/lib/duplicate-check", () => ({
  findDuplicateRecipe: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/claude", () => ({
  parseRecipeFromPdf: jest.fn(),
  reviewAndImproveRecipe: jest
    .fn()
    .mockResolvedValue({ recipe: { title: "Rezept A", source: { type: "pdf", value: "buch.pdf" } } }),
}));

jest.mock("@/lib/pdf", () => ({
  loadPdf: jest.fn(),
  extractPages: jest.fn().mockResolvedValue([{ pageNumber: 1, text: "x", imageBase64: "AAAA" }]),
  getPdfTitle: jest.fn().mockReturnValue(null),
}));

jest.mock("@/lib/pdf-import", () => {
  const actual = jest.requireActual("@/lib/pdf-import");
  return {
    ...actual,
    downloadPdf: jest.fn(),
    deletePdf: jest.fn().mockResolvedValue(undefined),
  };
});

const mockMaybeSingle = jest.fn();
const mockDeleteEq = jest.fn().mockResolvedValue({ error: null });
jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: mockMaybeSingle })) })),
      })),
      delete: jest.fn(() => ({ eq: mockDeleteEq })),
    })),
  },
}));

import { POST } from "@/app/api/import-pdf/pick/route";
import { checkDailyImportLimit } from "@/lib/import-rate-limit";
import { parseRecipeFromPdf } from "@/lib/claude";
import { loadPdf } from "@/lib/pdf";
import { downloadPdf, deletePdf } from "@/lib/pdf-import";

const rateLimit = checkDailyImportLimit as jest.Mock;
const parsePdf = parseRecipeFromPdf as jest.Mock;
const load = loadPdf as jest.Mock;
const download = downloadPdf as jest.Mock;
const remove = deletePdf as jest.Mock;

function req(body: object) {
  return new NextRequest("http://localhost/api/import-pdf/pick", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function validSession() {
  return {
    id: "sess-1",
    user_id: "u1",
    storage_key: "u1/x.pdf",
    filename: "buch.pdf",
    page_order: [1, 2],
    candidates: [{ title: "Rezept A", shortDescription: "", pageRange: [1, 1] }],
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };
}

beforeEach(() => {
  rateLimit.mockReset().mockResolvedValue({ userId: "u1", allowed: true, count: 1, remaining: 19 });
  parsePdf.mockReset().mockResolvedValue({
    result: { kind: "single", recipe: { title: "Rezept A", source: { type: "pdf", value: "buch.pdf" } } },
  });
  load.mockReset().mockResolvedValue({ doc: {}, pageCount: 2, needsPassword: false, authenticated: true });
  download.mockReset().mockResolvedValue(Buffer.from("%PDF-1.7"));
  remove.mockReset().mockResolvedValue(undefined);
  mockMaybeSingle.mockReset().mockResolvedValue({ data: validSession(), error: null });
  mockDeleteEq.mockClear();
});

describe("POST /api/import-pdf/pick", () => {
  it("returns 401 when unauthenticated", async () => {
    rateLimit.mockResolvedValueOnce({ userId: null, allowed: false, count: 0, remaining: 0 });
    const res = await POST(req({ sessionId: "sess-1", candidateId: 0 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when sessionId/candidateId are missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 410 when the session does not exist", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(req({ sessionId: "gone", candidateId: 0 }));
    expect(res.status).toBe(410);
  });

  it("returns 410 when the session has expired", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { ...validSession(), expires_at: new Date(Date.now() - 1000).toISOString() },
      error: null,
    });
    const res = await POST(req({ sessionId: "sess-1", candidateId: 0 }));
    expect(res.status).toBe(410);
  });

  it("parses the picked recipe, then deletes the object and the session", async () => {
    const res = await POST(req({ sessionId: "sess-1", candidateId: 0 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.kind).toBe("single");
    expect(parsePdf).toHaveBeenCalledWith(expect.anything(), "buch.pdf", { detectMultiple: false }, "u1");
    expect(remove).toHaveBeenCalledWith("u1/x.pdf");
    expect(mockDeleteEq).toHaveBeenCalledWith("id", "sess-1");
  });
});
