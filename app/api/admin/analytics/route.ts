import { NextRequest, NextResponse } from "next/server";
import { fetchInteractionMetrics, parseWindow } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const window = parseWindow(request.nextUrl.searchParams.get("window"));
  try {
    const data = await fetchInteractionMetrics(window);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("[api/admin/analytics] failed:", err);
    return NextResponse.json(
      { data: null, error: "Analyse konnte nicht geladen werden." },
      { status: 500 },
    );
  }
}
