export type SniffedImageType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/heic";

const HEIC_BRANDS = new Set([
  "heic", "heix", "hevc", "hevm", "hevs", "heim", "heis", "mif1", "msf1",
]);

// Identify the real image format from the file's leading bytes. Returns null
// for anything that is not one of the supported formats — the upload route
// rejects those regardless of the client-supplied MIME type, which is
// attacker-controlled.
export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: "GIF87a" / "GIF89a"
  const head6 = buffer.toString("latin1", 0, 6);
  if (head6 === "GIF87a" || head6 === "GIF89a") {
    return "image/gif";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  // HEIC/HEIF: ISO BMFF container — "ftyp" at offset 4, known brand at offset 8
  if (buffer.length >= 16 && buffer.toString("latin1", 4, 8) === "ftyp") {
    const brand = buffer.toString("latin1", 8, 12).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return "image/heic";
  }

  return null;
}
