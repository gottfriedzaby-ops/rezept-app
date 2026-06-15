import { NextRequest, NextResponse } from "next/server";
import heicConvert from "heic-convert";
import { estimateNutritionFromPhoto, type ImageMediaType } from "@/lib/claude";
import { sniffImageType } from "@/lib/image-validation";
import {
  checkDailyPhotoEstimateLimit,
  photoEstimateRateLimitErrorMessage,
} from "@/lib/nutrition-photo-rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const rateLimit = await checkDailyPhotoEstimateLimit();
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { data: null, error: photoEstimateRateLimitErrorMessage(rateLimit) },
        { status: rateLimit.userId ? 429 : 401 }
      );
    }

    const formData = await request.formData();
    const photo = formData.get("photo") as File | null;
    if (!photo) {
      return NextResponse.json({ data: null, error: "photo ist erforderlich" }, { status: 400 });
    }
    const descRaw = formData.get("description");
    const description =
      typeof descRaw === "string" && descRaw.trim() ? descRaw.trim().slice(0, 300) : null;
    if (photo.size > MAX_BYTES) {
      return NextResponse.json(
        { data: null, error: "Das Bild ist zu groß (max. 10 MB)." },
        { status: 400 }
      );
    }

    const arrayBuffer = await photo.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    // Trust the magic bytes, not the client-supplied MIME type.
    const sniffed = sniffImageType(buffer);
    if (!sniffed) {
      return NextResponse.json(
        { data: null, error: "Nur JPEG, PNG, WEBP, GIF und HEIC werden unterstützt." },
        { status: 400 }
      );
    }

    let finalMediaType: ImageMediaType;
    if (sniffed === "image/heic") {
      try {
        const converted = await heicConvert({ buffer: arrayBuffer, format: "JPEG", quality: 0.9 });
        buffer = Buffer.from(converted);
        finalMediaType = "image/jpeg";
      } catch (heicError) {
        console.error("[nutrition/estimate-photo] HEIC conversion failed:", heicError);
        return NextResponse.json(
          { data: null, error: "HEIC-Konvertierung fehlgeschlagen. Bitte als JPEG exportieren." },
          { status: 400 }
        );
      }
    } else {
      finalMediaType = sniffed;
    }

    const base64 = buffer.toString("base64");
    const estimate = await estimateNutritionFromPhoto(
      base64,
      finalMediaType,
      rateLimit.userId,
      description
    );

    if (estimate.kcal_per_serving == null) {
      return NextResponse.json(
        {
          data: null,
          error: "Aus dem Foto konnten keine Nährwerte geschätzt werden. Bitte manuell eingeben.",
          code: "ESTIMATE_FAILED",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: estimate, error: null });
  } catch (error) {
    console.error("[nutrition/estimate-photo] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Schätzung fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
