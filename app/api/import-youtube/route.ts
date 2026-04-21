import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { parseRecipeFromText } from "@/lib/claude";
import { supabaseAdmin } from "@/lib/supabase";
import type { Recipe } from "@/types/recipe";

const VIDEO_ID_RE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

function extractVideoId(url: string): string | null {
  if (url.length === 11 && !url.includes("/")) return url; // bare ID
  const match = url.match(VIDEO_ID_RE);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json({ data: null, error: "url is required" }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { data: null, error: "Ungültige YouTube-URL" },
        { status: 400 }
      );
    }

    // ── Duplicate check ────────────────────────────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .eq("source_value", videoId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { data: null, error: "Ein Rezept von diesem Video existiert bereits" },
        { status: 409 }
      );
    }

    // ── YouTube metadata ───────────────────────────────────────────────────
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("YOUTUBE_API_KEY ist nicht gesetzt");

    const metaRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${apiKey}`,
      { cache: "no-store" }
    );
    if (!metaRes.ok) throw new Error(`YouTube API Fehler: ${metaRes.status}`);

    const meta = (await metaRes.json()) as {
      items?: Array<{ snippet: { title: string; description: string; channelTitle: string } }>;
    };
    const snippet = meta.items?.[0]?.snippet;
    if (!snippet) {
      return NextResponse.json({ data: null, error: "Video nicht gefunden" }, { status: 404 });
    }

    const { title: videoTitle, description, channelTitle: channelName } = snippet;

    // ── Transcript ─────────────────────────────────────────────────────────
    let transcriptText = "";
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = segments.map((s) => s.text).join(" ");
    } catch {
      // No captions available — proceed with title + description only
    }

    const combined = [
      `Titel: ${videoTitle}`,
      `Kanal: ${channelName}`,
      description && `Beschreibung:\n${description.slice(0, 3000)}`,
      transcriptText && `Transkript:\n${transcriptText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    // ── Parse with Claude ──────────────────────────────────────────────────
    const parsed = await parseRecipeFromText(combined, "youtube", videoId);

    // ── Save to Supabase ───────────────────────────────────────────────────
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
        source_type: "youtube",
        source_value: videoId,
        source_title: channelName,
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
