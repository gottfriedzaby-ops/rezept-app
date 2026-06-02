import { NextRequest } from "next/server";

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));

jest.mock("@/lib/pdf", () => ({
  loadPdf: jest.fn(),
  detectScanned: jest.fn().mockReturnValue(false),
  renderThumbnails: jest
    .fn()
    .mockResolvedValue([{ pageNumber: 1, dataUrl: "data:image/jpeg;base64,AAAA" }]),
}));

jest.mock("@/lib/pdf-import", () => {
  const actual = jest.requireActual("@/lib/pdf-import");
  return {
    ...actual,
    downloadPdf: jest.fn(),
    deletePdf: jest.fn().mockResolvedValue(undefined),
  };
});

import { POST } from "@/app/api/import-pdf/preview/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadPdf } from "@/lib/pdf";
import { downloadPdf } from "@/lib/pdf-import";

const serverClient = createSupabaseServerClient as jest.Mock;
const load = loadPdf as jest.Mock;
const download = downloadPdf as jest.Mock;

function req(body: object) {
  return new NextRequest("http://localhost/api/import-pdf/preview", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function withUser(id: string | null) {
  serverClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) },
  });
}

const OK_KEY = "u1/uuid-rezept.pdf";

beforeEach(() => {
  serverClient.mockReset();
  load.mockReset().mockResolvedValue({ doc: {}, pageCount: 2, needsPassword: false, authenticated: true });
  download.mockReset().mockResolvedValue(Buffer.from("%PDF-1.7"));
  withUser("u1");
});

describe("POST /api/import-pdf/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    withUser(null);
    const res = await POST(req({ storageKey: OK_KEY }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the storageKey is not owned by the user", async () => {
    const res = await POST(req({ storageKey: "someone-else/file.pdf" }));
    expect(res.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("returns a password sentinel for an encrypted PDF", async () => {
    load.mockResolvedValueOnce({ doc: {}, pageCount: 0, needsPassword: true, authenticated: false });
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(json.error).toBe("PDF_PASSWORD_REQUIRED");
  });

  it("returns thumbnails and page count on success", async () => {
    const res = await POST(req({ storageKey: OK_KEY }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.numPages).toBe(2);
    expect(json.data.thumbs).toHaveLength(1);
    expect(json.data.thumbs[0].dataUrl).toContain("data:image/jpeg");
  });
});
