// Feature 20 — client-side analytics capture.
//
// Module-level singleton buffer with a debounced, single-flight flush to
// /api/events. Mirrors the debounce + single-flight + queued-retrigger shape of
// lib/shopping-list-sync.ts. Wired to React by contexts/AnalyticsContext.tsx.
//
// Best-effort by design: the buffer is in-memory only. Events are dropped
// silently on failure, when consent is off, or before the user is known — the
// contract is that tracking never breaks the app.

import {
  normalizeRoute,
  type AnalyticsEventName,
  type PropsArg,
} from "@/lib/analytics-events";

const FLUSH_DEBOUNCE_MS = 3000;
const FLUSH_INTERVAL_MS = 15000;
const MAX_BUFFER = 100; // flush immediately once this many events are queued
const HARD_CAP = 500; // bound memory if we pile up while offline (drop oldest)
const MAX_BATCH = 100; // matches MAX_EVENTS on the server
const SESSION_KEY = "rezept-app:analytics-session";

interface BufferedEvent {
  id: string;
  event_name: string;
  properties: Record<string, unknown> | null;
  path: string | null;
  locale: string | null;
  session_id: string | null;
  client_ts: string;
}

let buffer: BufferedEvent[] = [];
let flushing = false;
let queued = false;
let enabled = false;
let authed = false;
let disabled = false; // set after a 503 (table not migrated) — stop trying
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function scheduleFlush(delay = FLUSH_DEBOUNCE_MS): void {
  if (typeof window === "undefined") return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void sendBatch();
  }, delay);
}

async function sendBatch(): Promise<void> {
  if (typeof window === "undefined" || disabled) return;
  if (flushing) {
    queued = true;
    return;
  }
  if (buffer.length === 0) return;
  flushing = true;
  const batch = buffer.slice(0, MAX_BATCH);
  try {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
    if (res.status === 503) {
      // Table not migrated yet — degrade to a no-op for the rest of the session.
      disabled = true;
      buffer = [];
      return;
    }
    if (res.ok) {
      buffer = buffer.slice(batch.length);
    }
    // Other failures: keep the buffer for the next flush.
  } catch {
    // Network error / offline: keep the buffer, retry later.
  } finally {
    flushing = false;
    const more = queued || buffer.length > 0;
    queued = false;
    if (more && buffer.length > 0 && !disabled) scheduleFlush(0);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function configureAnalytics(opts: {
  enabled: boolean;
  authenticated: boolean;
}): void {
  enabled = opts.enabled;
  authed = opts.authenticated;
  // Drop anything buffered the moment consent is withdrawn or the user logs out.
  if (!enabled || !authed) buffer = [];
}

export function track<K extends AnalyticsEventName>(
  name: K,
  ...args: PropsArg<K>
): void {
  if (typeof window === "undefined") return;
  if (disabled || !enabled || !authed) return;
  const raw = (args[0] ?? null) as Record<string, unknown> | null;
  const properties = raw && Object.keys(raw).length > 0 ? raw : null;
  buffer.push({
    id: crypto.randomUUID(),
    event_name: name,
    properties,
    path: normalizeRoute(window.location.pathname),
    locale: document.documentElement.lang || null,
    session_id: getSessionId(),
    client_ts: new Date().toISOString(),
  });
  if (buffer.length > HARD_CAP) buffer.splice(0, buffer.length - HARD_CAP);
  if (buffer.length >= MAX_BUFFER) void sendBatch();
  else scheduleFlush();
}

// useBeacon=true for the pagehide / visibility-hidden unload paths.
export function flush(useBeacon = false): void {
  if (typeof window === "undefined" || disabled || buffer.length === 0) return;
  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    const batch = buffer.slice(0, MAX_BATCH);
    try {
      const ok = navigator.sendBeacon(
        "/api/events",
        new Blob([JSON.stringify({ events: batch })], { type: "application/json" }),
      );
      if (ok) buffer = buffer.slice(batch.length);
    } catch {
      // ignore — best effort on unload
    }
    return;
  }
  void sendBatch();
}

export function resetAnalyticsSession(): void {
  buffer = [];
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export function installFlushListeners(): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => flush();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush(true);
  };
  const onPageHide = () => flush(true);
  const interval = setInterval(() => {
    if (buffer.length > 0) flush();
  }, FLUSH_INTERVAL_MS);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    clearInterval(interval);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", onPageHide);
  };
}
