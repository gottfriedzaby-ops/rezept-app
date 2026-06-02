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
    .mockResolvedValue({ recipe: { title: "Brötchen", source: { type: "pdf", value: "Brötchen.pdf" } } }),
}));

jest.mock("@/lib/pdf", () => ({
  loadPdf: jest.fn(),
  detectScanned: jest.fn().mockReturnValue(false),
  extractPages: jest.fn().mockResolvedValue([{ pageNumber: 1, text: "Mehl", imageBase64: "AAAA" }]),
  getPdfTitle: jest.fn().mockReturnValue(null),
}));

// Keep the real constants + finalizeSingleRecipe, but stub the storage I/O.
jest.mock("@/lib/pdf-import", () => {
  const actual = jest.requireActual("@/lib/pdf-import");
  return {
    ...actual,
    downloadPdf: jest.fn(),
    deletePdf: jest.fn().mockResolvedValue(undefined),
  };
});

const mockSessionSingle = jest.fn().mockResolvedValue({ data: { id: "sess-1" }, error: null });
jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: jest.fn(() => ({ select: jest.fn(() => ({ single: mockSessionSingle })) })),
    })),
  },
}));

import { POST } from "@/app/api/import-pdf/route";
import { checkDailyImportLimit } from "@/lib/import-rate-limit";
import { parseRecipeFromPdf } from "@/lib/claude";
import { findDuplicateRecipe } from "@/lib/duplicate-check";
import { loadPdf, detectScanned } from "@/lib/pdf";
import { downloadPdf, deletePdf, MAX_PDF_BYTES } from "@/lib/pdf-import";

const rateLimit = checkDailyImportLimit as jest.Mock;
const parsePdf = parseRecipeFromPdf as jest.Mock;
const findDup = findDuplicateRecipe as jest.Mock;
const load = loadPdf as jest.Mock;
const scanned = detectScanned as jest.Mock;
const download = downloadPdf as jest.Mock;
const remove = deletePdf as jest.Mock;

function req(body: object) {
  return new NextRequest("http://localhost/api/import-pdf", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const OK_KEY = "u1/uuid-rezept.pdf";

beforeEach(() => {
  rateLimit.mockReset().mockResolvedValue({ userId: "u1", allowed: true, count: 1, remaining: 19 });
  parsePdf.mockReset();
  findDup.mockReset().mockResolvedValue(null);
  load.mockReset().mockResolvedValue({ doc: {}, pageCount: 2, needsPassword: false, authenticated: true });
  scanned.mockReset().mockReturnValue(false);
  download.mockReset().mockResolvedValue(Buffer.from("%PDF-1.7"));
  remove.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/import-pdf", () => {
  it("returns 401 when unauthenticated", async () => {
    rateLimit.mockResolvedValueOnce({ userId: null, allowed: false, count: 0, remaining: 0 });
    const res = await POST(req({ storageKey: OK_KEY }));
    expect(res.status).toBe(401);
  });

  it("returns 429 when the daily limit is reached", async () => {
    rateLimit.mockResolvedValueOnce({ userId: "u1", allowed: false, count: 20, remaining: 0 });
    const res = await POST(req({ storageKey: OK_KEY }));
    expect(res.status).toBe(429);
  });

  it("returns 400 when storageKey is missing", async () => {
    const res = await POST(req({ filename: "x.pdf" }));
    expect(res.status).toBe(400);
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it("returns 403 when the storageKey is not owned by the user", async () => {
    const res = await POST(req({ storageKey: "other-user/file.pdf" }));
    expect(res.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a PDF larger than the size cap", async () => {
    download.mockResolvedValueOnce(Buffer.alloc(MAX_PDF_BYTES + 1));
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("10 MB");
    expect(remove).toHaveBeenCalled();
  });

  it("asks for a password when the PDF is encrypted", async () => {
    load.mockResolvedValueOnce({ doc: {}, pageCount: 0, needsPassword: true, authenticated: false });
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(json.error).toBe("PDF_PASSWORD_REQUIRED");
    expect(remove).not.toHaveBeenCalled(); // keep the object so the user can retry
  });

  it("reports a wrong password when one was supplied", async () => {
    load.mockResolvedValueOnce({ doc: {}, pageCount: 0, needsPassword: true, authenticated: false });
    const res = await POST(req({ storageKey: OK_KEY, password: "nope" }));
    const json = await res.json();
    expect(json.error).toBe("PDF_PASSWORD_WRONG");
  });

  it("rejects a PDF with more than 10 pages", async () => {
    load.mockResolvedValueOnce({ doc: {}, pageCount: 11, needsPassword: false, authenticated: true });
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("10 Seiten");
  });

  it("rejects a scanned PDF longer than 5 pages", async () => {
    load.mockResolvedValueOnce({ doc: {}, pageCount: 6, needsPassword: false, authenticated: true });
    scanned.mockReturnValueOnce(true);
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toContain("Eingescannte");
  });

  it("returns a single parsed recipe and deletes the temp object", async () => {
    parsePdf.mockResolvedValueOnce({
      result: { kind: "single", recipe: { title: "Brötchen", source: { type: "pdf", value: "Brötchen.pdf" } } },
    });
    const res = await POST(req({ storageKey: OK_KEY, filename: "Brötchen.pdf", pageOrder: [1, 2] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.kind).toBe("single");
    expect(json.data.sourceTitle).toBe("Brötchen.pdf");
    expect(json.data.imageUrl).toBeNull();
    expect(remove).toHaveBeenCalledWith(OK_KEY);
  });

  it("returns candidates + sessionId for a multi-recipe PDF and keeps the object", async () => {
    parsePdf.mockResolvedValueOnce({
      result: {
        kind: "multi",
        candidates: [
          { title: "A", shortDescription: "", pageRange: [1, 1] },
          { title: "B", shortDescription: "", pageRange: [2, 2] },
        ],
      },
    });
    const res = await POST(req({ storageKey: OK_KEY, pageOrder: [1, 2] }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.kind).toBe("multi");
    expect(json.data.sessionId).toBe("sess-1");
    expect(json.data.candidates).toHaveLength(2);
    expect(remove).not.toHaveBeenCalled();
  });

  it("flags a duplicate via the (PDF stage-3-only) check", async () => {
    parsePdf.mockResolvedValueOnce({
      result: { kind: "single", recipe: { title: "Brötchen", source: { type: "pdf", value: "Brötchen.pdf" } } },
    });
    findDup.mockResolvedValueOnce({ existingRecipeId: "r9", existingTitle: "Brötchen" });
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe("duplicate");
    expect(json.existingRecipeId).toBe("r9");
    // duplicate check must run with sourceType "pdf" so stages 1 & 2 are skipped
    expect(findDup).toHaveBeenCalledWith(expect.anything(), expect.anything(), "u1", "pdf");
  });
});
