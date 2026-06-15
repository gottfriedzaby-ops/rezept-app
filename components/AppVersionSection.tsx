"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { APP_VERSION, RELEASES } from "@/lib/changelog";
import WhatsNewDialog from "@/components/WhatsNewDialog";

/**
 * Einstellungen-Block "Über die App": zeigt die aktuelle Version und öffnet
 * auf Wunsch den vollständigen Änderungsverlauf.
 */
export default function AppVersionSection() {
  const t = useTranslations("Settings");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border-secondary bg-surface-primary p-5">
      <p className="text-sm text-ink-secondary">
        {t("appVersion", { version: APP_VERSION })}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-sm font-medium text-forest transition-colors hover:text-forest-deep"
      >
        {t("viewChangelog")}
      </button>
      <WhatsNewDialog open={open} releases={RELEASES} onClose={() => setOpen(false)} />
    </div>
  );
}
