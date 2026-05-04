import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { parseRecipeFromText, reviewAndImproveRecipe } from "@/lib/claude";
import { findDuplicateRecipe, checkUrlDuplicate } from "@/lib/duplicate-check";
import { buildKnownAmountsPreamble, buildInlineAmountsPreamble } from "@/lib/amounts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VIDEO_ID_RE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

function extractVideoId(url: string): string | null {
  if (url.length === 11 && !url.includes("/")) return url;
  const match = url.match(VIDEO_ID_RE);
  return match ? match[1] : null;
}

async function getThumbnail(videoId: string): Promise<string> {
  const maxres = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const res = await fetch(maxres, { method: "HEAD", cache: "no-store" });
    if (res.ok) return maxres;
  } catch { /* fall through */ }
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return NextResponse.json({ data: null, error: "url is required" }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json({ data: null, error: "Ungültige YouTube-URL" }, { status: 400 });
    }

    const earlyDuplicate = await checkUrlDuplicate(videoId);
    if (earlyDuplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...earlyDuplicate },
        { status: 409 }
      );
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("YOUTUBE_API_KEY ist nicht gesetzt");

    const [metaRes, imageUrl] = await Promise.all([
      fetch(
        `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${apiKey}`,
        { cache: "no-store" }
      ),
      getThumbnail(videoId),
    ]);

    if (!metaRes.ok) throw new Error(`YouTube API Fehler: ${metaRes.status}`);

    const meta = (await metaRes.json()) as {
      items?: Array<{ snippet: { title: string; description: string; channelTitle: string } }>;
    };
    const snippet = meta.items?.[0]?.snippet;
    if (!snippet) {
      return NextResponse.json({ data: null, error: "Video nicht gefunden" }, { status: 404 });
    }

    const { title: videoTitle, description, channelTitle: channelName } = snippet;

    let transcriptText = "";
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId);
      transcriptText = segments.map((s) => s.text).join(" ");
    } catch {
      // No captions available — proceed with title + description only
    }

    const desc = description ?? "";
    const knownAmounts =
      buildInlineAmountsPreamble(desc) + buildKnownAmountsPreamble(desc);
    const combined = [
      knownAmounts || undefined,
      `Titel: ${videoTitle}`,
      `Kanal: ${channelName}`,
      description && `Beschreibung:\n${description.slice(0, 6000)}`,
      transcriptText && `Transkript:\n${transcriptText}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { recipe: parsed } = await parseRecipeFromText(combined, "youtube", videoId);
    const { recipe: reviewed } = await reviewAndImproveRecipe(parsed);

    const duplicate = await findDuplicateRecipe(reviewed.title, videoId);
    if (duplicate) {
      return NextResponse.json(
        { data: null, error: "duplicate", ...duplicate },
        { status: 409 }
      );
    }

    return NextResponse.json({
      data: { recipe: reviewed, sourceTitle: channelName, imageUrl },
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import fehlgeschlagen";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
