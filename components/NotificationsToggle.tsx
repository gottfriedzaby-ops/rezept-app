"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  isPushSupported,
  isPushConfigured,
  getPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-client";

// Settings toggle that subscribes/unsubscribes THIS device to Web Push. The
// source of truth is the browser's actual push subscription, not a DB flag.
export default function NotificationsToggle() {
  const t = useTranslations("Settings");
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ok = isPushSupported() && isPushConfigured();
    setSupported(ok);
    if (ok) getPushSubscribed().then(setEnabled).catch(() => {});
  }, []);

  async function handleToggle() {
    if (busy || !supported) return;
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      const ok = next ? await subscribeToPush() : await unsubscribeFromPush();
      if (ok) setEnabled(next);
      else setError(next ? t("notificationsBlocked") : t("settingsSaveError"));
    } catch {
      setError(t("settingsSaveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-secondary bg-surface-primary p-5">
      <div className="flex items-start gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("enableNotifications")}
          onClick={handleToggle}
          disabled={busy || !supported}
          className={[
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-forest disabled:opacity-50 shrink-0 mt-0.5",
            enabled ? "bg-forest" : "bg-stone-300",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-3.5 w-3.5 rounded-full bg-surface-card shadow transition-transform",
              enabled ? "translate-x-4.5" : "translate-x-0.5",
            ].join(" ")}
          />
        </button>
        <div>
          <p className="text-sm font-medium text-ink-primary">{t("enableNotifications")}</p>
          <p className="text-xs text-ink-tertiary mt-1 leading-relaxed">
            {t("enableNotificationsDesc")}
          </p>
          {!supported && (
            <p className="text-xs text-ink-tertiary mt-1">{t("notificationsUnsupported")}</p>
          )}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}
