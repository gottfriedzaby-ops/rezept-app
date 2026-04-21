import { NextRequest, NextResponse } from "next/server";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
import heicConvert from "heic-convert";
import { parseRecipeFromImage } from "@/lib/claude";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";

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

    // ── Duplicate check ───────────────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .eq("source_value", fileName)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { data: null, error: "Ein Rezept mit diesem Dateinamen existiert bereits" },
        { status: 409 }
      );
    }

    // ── Buffer + optional HEIC → JPEG conversion ──────────────────────────
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

    // ── Claude vision ─────────────────────────────────────────────────────
    const base64 = buffer.toString("base64");
    const parsed = await parseRecipeFromImage(base64, finalMediaType, fileName);

    // ── Save to Supabase ──────────────────────────────────────────────────
    const { data: insertData, error: dbError } = await supabaseAdmin
      .from("recipes")
      .insert({
        title: parsed.title,
        servings: parsed.servings,
        prep_time: parsed.prepTime,
        cook_time: parsed.cookTime,
        ingredients: parsed.ingredients,
        steps: parsed.steps,
        tags: parsed.tags,
        source_type: "photo",
        source_value: fileName,
        source_title: fileName,
        description: null,
        image_url: null,
        step_images: [],
      })
      .select()
      .single();

    const recipe = insertData as Recipe | null;
    if (dbError) throw dbError;

    return NextResponse.json({ data: recipe, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
