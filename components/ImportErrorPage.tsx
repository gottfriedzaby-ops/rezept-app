"use client";

import Link from "next/link";
import type { ImportErrorCode } from "@/contexts/ImportContext";

type ImportType = "url" | "youtube" | "photo" | "instagram" | "pdf";

interface Props {
  sourceType: ImportType;
  errorCode: ImportErrorCode;
  onRetry: () => void;
}

const HEADING_BY_CODE: Record<ImportErrorCode, string> = {
  FETCH_BLOCKED: "Konnten die Seite nicht lesen",
  EMPTY_PARSE: "Konnten kein Rezept extrahieren",
};

const BODY_BY_CODE: Record<ImportErrorCode, string> = {
  FETCH_BLOCKED:
    "Die Seite ist evtl. durch Cloudflare oder einen Login geschützt. Bitte das Rezept manuell anlegen oder eine andere URL versuchen.",
  EMPTY_PARSE:
    "Wir konnten weder Zutaten noch Schritte erkennen. Bitte das Rezept manuell anlegen oder eine andere Quelle versuchen.",
};

const RETRY_LABEL_BY_TYPE: Record<ImportType, string> = {
  url: "Andere URL versuchen",
  youtube: "Anderes Video versuchen",
  photo: "Andere Bilder versuchen",
  instagram: "Anderen Instagram-Link versuchen",
  pdf: "Anderes PDF versuchen",
};

export default function ImportErrorPage({ sourceType, errorCode, onRetry }: Props) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-serif text-ink-primary">
          {HEADING_BY_CODE[errorCode]}
        </h2>
        <p className="text-sm text-ink-secondary">{BODY_BY_CODE[errorCode]}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Link
          href="/recipes/new"
          className="btn-primary py-2.5 text-sm text-center"
        >
          Manuell anlegen
        </Link>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2.5 text-sm border border-stone rounded text-ink-secondary hover:border-ink-secondary hover:text-ink-primary transition-colors"
        >
          {RETRY_LABEL_BY_TYPE[sourceType]}
        </button>
      </div>
    </div>
  );
}
