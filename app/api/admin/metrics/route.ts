import { NextRequest, NextResponse } from "next/server";
import { fetchDashboardMetrics, parseWindow } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const window = parseWindow(request.nextUrl.searchParams.get("window"));
  try {
    const data = await fetchDashboardMetrics(window);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fehler beim Laden der Metriken";
    console.error("[api/admin/metrics] failed:", err);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
