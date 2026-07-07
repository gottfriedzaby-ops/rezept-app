"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  configureAnalytics,
  installFlushListeners,
  resetAnalyticsSession,
  track,
} from "@/lib/analytics-client";
import {
  ANALYTICS_DEFAULT_ENABLED,
  type AnalyticsEventName,
  type PropsArg,
} from "@/lib/analytics-events";

interface AnalyticsContextValue {
  track: <K extends AnalyticsEventName>(name: K, ...args: PropsArg<K>) => void;
}

const noopTrack: AnalyticsContextValue["track"] = () => {};
const AnalyticsContext = createContext<AnalyticsContextValue>({ track: noopTrack });

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [consentEnabled, setConsentEnabled] = useState(false);
  const lastPathRef = useRef<string | null>(null);

  // Install flush listeners once for the app's lifetime.
  useEffect(() => installFlushListeners(), []);

  // Resolve consent whenever the signed-in user changes. Tracking stays a no-op
  // until this resolves, so nothing is buffered before consent is known.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      configureAnalytics({ enabled: false, authenticated: false });
      resetAnalyticsSession();
      setConsentEnabled(false);
      lastPathRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      let consent = ANALYTICS_DEFAULT_ENABLED;
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const value = json?.data?.analytics_enabled;
          if (typeof value === "boolean") consent = value;
        }
      } catch {
        // network error — fall back to the default
      }
      if (cancelled) return;
      configureAnalytics({ enabled: consent, authenticated: true });
      setConsentEnabled(consent);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  // Honour opt-out live (the settings toggle dispatches this) without a reload.
  useEffect(() => {
    function onConsentChanged(event: Event) {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (detail && typeof detail.enabled === "boolean") {
        configureAnalytics({ enabled: detail.enabled, authenticated: true });
        setConsentEnabled(detail.enabled);
      }
    }
    window.addEventListener("analytics:consent-changed", onConsentChanged);
    return () => window.removeEventListener("analytics:consent-changed", onConsentChanged);
  }, []);

  // Auto page_view on route change (and once consent turns on for the landing
  // route). Deduped so a Strict-Mode remount / same-path re-render fires once.
  useEffect(() => {
    if (!consentEnabled) return;
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    track("page_view");
  }, [pathname, consentEnabled]);

  const value = useMemo<AnalyticsContextValue>(() => ({ track }), []);

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}
