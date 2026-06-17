/**
 * App-Versionierung + Änderungshinweise ("Was ist neu").
 *
 * Diese Datei ist die einzige Quelle für die aktuelle App-Version und die
 * Reihenfolge der Releases. Die eigentlichen, übersetzten Texte je Release
 * liegen in `messages/*.json` unter `WhatsNew.releases.<messageKey>`.
 *
 * Neues Release hinzufügen:
 *   1. Eintrag **oben** in RELEASES ergänzen (neueste zuerst, eindeutige Version).
 *   2. `WhatsNew.releases.<messageKey>` in allen drei messages/*.json pflegen
 *      (`title` + `items`-Array).
 *   3. `package.json` "version" angleichen (für Konsistenz).
 */

export interface Release {
  /** Semver "x.y.z". In RELEASES eindeutig und absteigend sortiert. */
  version: string;
  /** Veröffentlichungsdatum als ISO-Date (YYYY-MM-DD). */
  date: string;
  /** Schlüssel-Suffix für die i18n-Texte unter `WhatsNew.releases.<messageKey>`. */
  messageKey: string;
}

/** Releases, neueste zuerst. */
export const RELEASES: Release[] = [
  { version: "1.4.2", date: "2026-06-17", messageKey: "v1_4_2" },
  { version: "1.4.1", date: "2026-06-17", messageKey: "v1_4_1" },
  { version: "1.4.0", date: "2026-06-15", messageKey: "v1_4_0" },
  { version: "1.3.0", date: "2026-06-08", messageKey: "v1_3_0" },
  { version: "1.2.0", date: "2026-06-01", messageKey: "v1_2_0" },
  { version: "1.1.0", date: "2026-05-22", messageKey: "v1_1_0" },
  { version: "1.0.0", date: "2026-05-12", messageKey: "v1_0_0" },
];

/** Aktuelle App-Version (= neuestes Release). */
export const APP_VERSION = RELEASES[0].version;

/** localStorage-Schlüssel für die zuletzt vom Nutzer gesehene Version. */
export const LAST_SEEN_VERSION_KEY = "rezept-app:lastSeenVersion";

/**
 * Vergleicht zwei Semver-Strings ("x.y.z"). Fehlende Segmente zählen als 0.
 * @returns negativ wenn a < b, 0 bei Gleichheit, positiv wenn a > b.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Liefert alle Releases, die der Nutzer seit `lastSeen` noch nicht gesehen hat
 * – neueste zuerst (kumuliert, falls mehrere Updates verpasst wurden).
 *
 * - `lastSeen === null` (Erstbesuch bzw. vor Einführung dieses Features): nur
 *   das neueste Release, damit beim Rollout nicht die gesamte Historie erscheint.
 * - sonst: alle Releases mit Version strikt größer als `lastSeen`.
 */
export function getReleasesSince(lastSeen: string | null): Release[] {
  if (!lastSeen) return RELEASES.slice(0, 1);
  return RELEASES.filter((release) => compareVersions(release.version, lastSeen) > 0);
}
