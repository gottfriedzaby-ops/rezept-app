import { NextRequest, NextResponse } from "next/server";
import heicConvert from "heic-convert";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${base}.${ext}`;
    const { data, error } = await supabaseAdmin.storage
      .from("recipe-images")
      .upload(path, buffer, { contentType: mimeType, upsert: false });
    if (error || !data) return null;
    const { data: urlData } = supabaseAdmin.storage.from("recipe-images").getPublicUrl(data.path);
    return urlData.publicUrl ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json({ data: null, error: "image ist erforderlich" }, { status: 400 });
    }

    const mimeType = image.type;
    const isHeic = HEIC_TYPES.has(mimeType) || /\.heic$/i.test(image.name);

    if (!SUPPORTED.has(mimeType as ImageMediaType) && !isHeic) {
      return NextResponse.json(
        { data: null, error: "Nur JPEG, PNG, WEBP und HEIC werden unterstützt" },
        { status: 400 }
      );
    }

    const arrayBuffer = await image.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    let finalMediaType: ImageMediaType = mimeType as ImageMediaType;

    if (isHeic) {
      try {
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

    const url = await uploadToStorage(buffer, image.name, finalMediaType);
    if (!url) {
      return NextResponse.json({ data: null, error: "Upload fehlgeschlagen" }, { status: 500 });
    }

    return NextResponse.json({ data: { url, fileName: image.name }, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
