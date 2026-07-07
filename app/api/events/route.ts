import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { routing } from "@/i18n/routing";
import {
  ANALYTICS_DEFAULT_ENABLED,
  EVENT_CATEGORY,
  isAnalyticsEventName,
} from "@/lib/analytics-events";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 100; // per batch
const MAX_PROPS_BYTES = 2048; // serialized properties cap
const MAX_EVENTS_PER_DAY = 5000; // fail-open abuse guard, per user, UTC day
const RELATION_MISSING = "42P01";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCALES = new Set<string>(routing.locales);

let warnedMissingTable = false;

interface EventRow {
  id: string;
  user_id: string;
  event_name: string;
  event_category: string | null;
  properties: Record<string, string | number | boolean | null> | null;
  path: string | null;
  locale: string | null;
  session_id: string | null;
  client_ts: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

// Keep only primitive values; drop nested objects/arrays and anything that
// pushes the serialized blob over the size cap (return null, never reject the
// whole event over one oversized property).
function sanitizeProperties(
  value: unknown,
): Record<string, string | number | boolean | null> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === null || ["string", "number", "boolean"].includes(typeof val)) {
      out[key.slice(0, 64)] = val as string | number | boolean | null;
    }
  }
  if (Object.keys(out).length === 0) return null;
  if (JSON.stringify(out).length > MAX_PROPS_BYTES) return null;
  return out;
}

// Returns a validated row or null (filtered out — a bad event never fails the
// batch). user_id / event_category are server-authoritative.
function sanitizeEvent(raw: unknown, userId: string): EventRow | null {
  if (!isRecord(raw)) return null;

  const id = typeof raw.id === "string" && UUID_RE.test(raw.id) ? raw.id.toLowerCase() : null;
  if (!id) return null;

  if (!isAnalyticsEventName(raw.event_name)) return null;

  const path =
    typeof raw.path === "string" ? raw.path.split("?")[0].slice(0, 300) : null;
  const locale =
    typeof raw.locale === "string" && LOCALES.has(raw.locale) ? raw.locale : null;
  const session_id =
    typeof raw.session_id === "string" ? raw.session_id.slice(0, 64) : null;
  const client_ts = isIsoDate(raw.client_ts) ? raw.client_ts : null;

  return {
    id,
    user_id: userId,
    event_name: raw.event_name,
    event_category: EVENT_CATEGORY[raw.event_name],
    properties: sanitizeProperties(raw.properties),
    path,
    locale,
    session_id,
    client_ts,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ data: null, error: "Nicht angemeldet" }, { status: 401 });
  }

  // Consent gate (defense-in-depth; the client also gates). Fall back to the
  // default if the row/column/table is missing.
  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("analytics_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  const consent =
    settings && typeof settings.analytics_enabled === "boolean"
      ? settings.analytics_enabled
      : ANALYTICS_DEFAULT_ENABLED;
  if (!consent) {
    // Not 403 — a non-OK response would trigger client retries.
    return NextResponse.json({ data: { accepted: 0 }, error: null });
  }

  const body = await request.json().catch(() => ({}));
  const rawEvents = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const rows = rawEvents
    .map((raw: unknown) => sanitizeEvent(raw, user.id))
    .filter((row: EventRow | null): row is EventRow => row !== null);

  if (rows.length === 0) {
    return NextResponse.json({ data: { accepted: 0 }, error: null });
  }

  // Fail-open per-user daily cap to bound a runaway/malicious client.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count, error: countError } = await supabaseAdmin
    .from("interaction_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", dayStart.toISOString());
  if (!countError && typeof count === "number" && count >= MAX_EVENTS_PER_DAY) {
    return NextResponse.json({ data: { accepted: 0 }, error: null });
  }

  const { error } = await supabaseAdmin
    .from("interaction_events")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    if (error.code === RELATION_MISSING) {
      if (!warnedMissingTable) {
        console.warn("[api/events] interaction_events table missing — run migration");
        warnedMissingTable = true;
      }
      return NextResponse.json(
        { data: null, error: "Analyse noch nicht eingerichtet." },
        { status: 503 },
      );
    }
    // Fail-open: never break the client over a logging write.
    console.error("[api/events] insert failed:", error);
    return NextResponse.json({ data: { accepted: 0 }, error: null });
  }

  return NextResponse.json({ data: { accepted: rows.length }, error: null });
}
