import type { NextRequest } from "next/server";

jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { storage: { from: jest.fn() } },
}));

jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  }),
}));

jest.mock("heic-convert", () => jest.fn());

import { POST } from "@/app/api/upload-image/route";
import { supabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const storageFromMock = supabaseAdmin.storage.from as jest.Mock;
const serverClientMock = createSupabaseServerClient as jest.Mock;

const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32),
]);

interface FakeFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function makeFile(opts: { name?: string; type?: string; size?: number; content?: Buffer }): FakeFile {
  const content = opts.content ?? JPEG_BYTES;
  return {
    name: opts.name ?? "foto.jpg",
    type: opts.type ?? "image/jpeg",
    size: opts.size ?? content.length,
    arrayBuffer: async () =>
      content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
  };
}

/** The route only calls request.formData() — a stub keeps the test hermetic. */
function makeRequest(image: FakeFile | null): NextRequest {
  const fd = { get: (key: string) => (key === "image" ? image : null) };
  return { formData: async () => fd } as unknown as NextRequest;
}

function setUnauthenticated() {
  serverClientMock.mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  });
}

function mockStorageUpload(result: { data: unknown; error: unknown }) {
  const upload = jest.fn().mockResolvedValue(result);
  const getPublicUrl = jest.fn().mockReturnValue({
    data: { publicUrl: "https://cdn.example/recipe-images/foo.jpg" },
  });
  storageFromMock.mockReturnValue({ upload, getPublicUrl });
  return { upload, getPublicUrl };
}

beforeEach(() => {
  storageFromMock.mockReset();
  serverClientMock.mockReset();
  serverClientMock.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
  });
});

describe("POST /api/upload-image", () => {
  it("returns 401 when not authenticated", async () => {
    setUnauthenticated();

    const res = await POST(makeRequest(makeFile({})));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Nicht angemeldet");
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no image is provided", async () => {
    const res = await POST(makeRequest(null));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("image ist erforderlich");
  });

  it("returns 413 when the file exceeds 10 MB", async () => {
    const res = await POST(makeRequest(makeFile({ size: 11 * 1024 * 1024 })));
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.error).toMatch(/zu groß/);
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported claimed MIME type", async () => {
    const res = await POST(makeRequest(makeFile({ type: "text/plain", name: "notes.txt" })));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/JPEG, PNG, WEBP und HEIC/);
  });

  it("returns 415 when the bytes are not a real image despite an image MIME type", async () => {
    const html = Buffer.concat([Buffer.from("<html><body>pwned"), Buffer.alloc(16)]);
    const res = await POST(makeRequest(makeFile({ type: "image/jpeg", content: html })));
    const body = await res.json();

    expect(res.status).toBe(415);
    expect(body.error).toMatch(/kein unterstütztes Bildformat/);
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("returns 415 when a file claims HEIC but contains JPEG bytes", async () => {
    const res = await POST(
      makeRequest(makeFile({ type: "image/heic", name: "foto.heic", content: JPEG_BYTES }))
    );

    expect(res.status).toBe(415);
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("uploads a valid JPEG and returns its public URL", async () => {
    const { upload } = mockStorageUpload({ data: { path: "foo.jpg" }, error: null });

    const res = await POST(makeRequest(makeFile({})));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.error).toBeNull();
    expect(body.data.url).toBe("https://cdn.example/recipe-images/foo.jpg");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toMatchObject({ contentType: "image/jpeg" });
  });

  it("returns 500 when the storage upload fails", async () => {
    mockStorageUpload({ data: null, error: { message: "bucket missing" } });

    const res = await POST(makeRequest(makeFile({})));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Upload fehlgeschlagen");
  });
});
