import { NextRequest, NextResponse } from "next/server";
import heicConvert from "heic-convert";
import { parseRecipeFromImage, reviewAndImproveRecipe } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const SUPPORTED = new Set<ImageMediaType>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const photo = formData.get("photo") as File | null;

    if (!photo) {
      return NextResponse.json({ data: null, error: "photo ist erforderlich" }, { status: 400 });
    }

    const fileName = photo.name;
    const mimeType = photo.type;
    const isHeic = HEIC_TYPES.has(mimeType) || /\.heic$/i.test(fileName);

    if (!SUPPORTED.has(mimeType as ImageMediaType) && !isHeic) {
      return NextResponse.json(
        { data: null, error: "Nur JPEG, PNG, WEBP und HEIC werden unterstützt" },
        { status: 400 }
      );
    }

    const arrayBuffer = await photo.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    let finalMediaType: ImageMediaType = mimeType as ImageMediaType;

    if (isHeic) {
      try {
        // Pass the raw ArrayBuffer — heicConvert expects ArrayBufferLike, not Buffer
        const converted = await heicConvert({ buffer: arrayBuffer, format: "JPEG", quality: 0.9 });
        buffer = Buffer.from(converted);
        finalMediaType = "image/jpeg";
      } catch {
        return NextResponse.json(
          { data: null, error: "HEIC-Konvertierung fehlgeschlagen. Bitte als JPEG exportieren." },
          { status: 400 }
        );
      }
    }

    const base64 = buffer.toString("base64");
    const parsed = await parseRecipeFromImage(base64, finalMediaType, fileName);
    const reviewed = await reviewAndImproveRecipe(parsed);

    return NextResponse.json({
      data: { recipe: reviewed, sourceTitle: fileName },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
