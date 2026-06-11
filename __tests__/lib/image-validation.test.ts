import { sniffImageType } from "@/lib/image-validation";

function bytes(...values: Array<number | string>): Buffer {
  const parts = values.map((v) =>
    typeof v === "string" ? Buffer.from(v, "latin1") : Buffer.from([v])
  );
  return Buffer.concat(parts);
}

/** Pads a buffer to a minimum length so the 12-byte guard does not trip. */
function padded(buffer: Buffer, length = 16): Buffer {
  if (buffer.length >= length) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(length - buffer.length)]);
}

describe("sniffImageType", () => {
  it("detects JPEG from FF D8 FF magic bytes", () => {
    expect(sniffImageType(padded(bytes(0xff, 0xd8, 0xff, 0xe0)))).toBe("image/jpeg");
  });

  it("detects PNG from its 8-byte signature", () => {
    expect(
      sniffImageType(padded(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)))
    ).toBe("image/png");
  });

  it("detects GIF87a and GIF89a", () => {
    expect(sniffImageType(padded(bytes("GIF87a")))).toBe("image/gif");
    expect(sniffImageType(padded(bytes("GIF89a")))).toBe("image/gif");
  });

  it("detects WEBP (RIFF container with WEBP fourcc)", () => {
    expect(sniffImageType(padded(bytes("RIFF", 0x00, 0x00, 0x00, 0x00, "WEBP")))).toBe(
      "image/webp"
    );
  });

  it("detects HEIC via ftyp box with a known brand", () => {
    // 4-byte box size, then "ftypheic"
    expect(sniffImageType(padded(bytes(0x00, 0x00, 0x00, 0x18, "ftypheic")))).toBe(
      "image/heic"
    );
    expect(sniffImageType(padded(bytes(0x00, 0x00, 0x00, 0x18, "ftypmif1")))).toBe(
      "image/heic"
    );
  });

  it("rejects an ftyp box with an unknown brand", () => {
    expect(sniffImageType(padded(bytes(0x00, 0x00, 0x00, 0x18, "ftypmp42")))).toBeNull();
  });

  it("returns null for non-image content (HTML, scripts, random bytes)", () => {
    expect(sniffImageType(padded(bytes("<html><script>")))).toBeNull();
    expect(sniffImageType(padded(bytes("#!/bin/sh\nrm -rf")))).toBeNull();
    expect(sniffImageType(Buffer.from(Array(16).fill(0x42)))).toBeNull();
  });

  it("returns null for buffers shorter than 12 bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it("does not trust a RIFF header without the WEBP fourcc (e.g. WAV)", () => {
    expect(sniffImageType(padded(bytes("RIFF", 0x00, 0x00, 0x00, 0x00, "WAVE")))).toBeNull();
  });
});
