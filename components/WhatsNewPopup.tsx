"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  APP_VERSION,
  LAST_SEEN_VERSION_KEY,
  getReleasesSince,
  type Release,
} from "@/lib/changelog";
import WhatsNewDialog from "@/components/WhatsNewDialog";

/**
 * Zeigt angemeldeten Nutzern nach einem Update einmalig die Änderungshinweise.
 * Wurden mehrere Updates verpasst, werden alle seither erschienenen Releases
 * gesammelt angezeigt. Der Stand wird pro Gerät in localStorage gemerkt.
 */
export default function WhatsNewPopup() {
  const { user, loading } = useAuth();
  const [releases, setReleases] = useState<Release[]>([]);
  const [open, setOpen] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (loading || !user || checked.current) return;
    checked.current = true;

    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch {
      // localStorage nicht verfügbar — wie Erstbesuch behandeln
    }

    const unseen = getReleasesSince(lastSeen);
    if (unseen.length > 0) {
      setReleases(unseen);
      setOpen(true);
    } else {
      // Bereits aktuell — Markierung frisch halten
      try {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
      } catch {
        // ignorieren — Popup erscheint sonst beim nächsten Mal erneut
      }
    }
  }, [user, loading]);

  function handleClose() {
    try {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
    } catch {
      // ignorieren — Popup erscheint sonst beim nächsten Mal erneut
    }
    setOpen(false);
  }

  return <WhatsNewDialog open={open} releases={releases} onClose={handleClose} />;
}
