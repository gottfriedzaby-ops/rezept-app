import { NextRequest, NextResponse } from "next/server";
import heicConvert from "heic-convert";
import { parseRecipeFromImage, reviewAndImproveRecipe } from "@/lib/claude";
import { supabaseAdmin } from "@/lib/supabase";
import { findDuplicateRecipe } from "@/lib/duplicate-check";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const SUPPORTED = new Set<ImageMediaType>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

async function uploadToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: ImageMediaType
): Promise<string | null> {
  try {
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
    const base = fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const path = `${Date.now()}-${base}.${ext}`;

    const { data, error } = await supabaseAdmin.storage
      .from("recipe-images") // bucket must exist in Supabase with public access enabled
      .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (error || !data) return null;

    const { data: urlData } = supabaseAdmin.storage
      .from("recipe-images")
      .getPublicUrl(data.path);

    return urlData.publicUrl ?? null;
  } catch {
    return null;
  }
}

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

    console.log("[import-photo] received:", fileName, mimeType, `${photo.size} bytes`, "isHeic:", isHeic);

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
        console.log("[import-photo] HEIC converted, buffer size:", buffer.length);
      } catch (heicError) {
        console.error("[import-photo] HEIC conversion failed:", heicError);
        return NextResponse.json(
          { data: null, error: "HEIC-Konvertierung fehlgeschlagen. Bitte als JPEG exportieren." },
          { status: 400 }
        );
      }
    }

    // Upload photo to Supabase Storage (the uploaded photo IS the cover image)
    const imageUrl = await uploadToStorage(buffer, fileName, finalMediaType);
    console.log("[import-photo] storage upload result:", imageUrl ?? "skipped/failed");

    console.log("[import-photo] calling Claude vision, buffer size:", buffer.length);
    const base64 = buffer.toString("base64");
    const parsed = await parseRecipeFromImage(base64, finalMediaType, fileName);
    console.log("[import-photo] parsed title:", parsed.title);

    const reviewed = await reviewAndImproveRecipe(parsed);
    console.log("[import-photo] review complete, returning response");

    const duplicate = await findDuplicateRecipe(reviewed.title, fileName);
    if (duplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...duplicate },
        { status: 409 }
      );
    }

    return NextResponse.json({
      data: { recipe: reviewed, sourceTitle: fileName, imageUrl },
      error: null,
    });
  } catch (error) {
    console.error("[import-photo] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
