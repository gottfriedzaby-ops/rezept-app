"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { ParsedRecipe } from "@/types/recipe";
import { useImport } from "@/contexts/ImportContext";
import { useAuth } from "@/contexts/AuthContext";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ImportProgress from "@/components/ImportProgress";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 10;
const PDF_BUCKET = "recipe-pdfs-temp";

interface Thumb {
  pageNumber: number;
  dataUrl: string;
}

interface Candidate {
  title: string;
  shortDescription: string;
  pageRange: [number, number];
}

type PreviewResponse = {
  data: { numPages: number; scanned: boolean; thumbs: Thumb[] } | null;
  error: string | null;
};

type ImportResponse = {
  data:
    | { kind: "single"; recipe: ParsedRecipe; sourceTitle: string; imageUrl: string | null }
    | { kind: "multi"; candidates: Candidate[]; sessionId: string }
    | null;
  error: string | null;
  existingRecipeId?: string;
  existingTitle?: string;
};

type Stage = "uploading" | "password" | "preview" | "submitting" | "picker" | "picking";

interface Props {
  file: File;
  onCancel: () => void;
}

export default function PdfImportFlow({ file, onCancel }: Props) {
  const t = useTranslations("Import");
  const { user } = useAuth();
  const { setParseResult, setPhase } = useImport();

  const [stage, setStage] = useState<Stage>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string; title: string | null } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [storageKey, setStorageKey] = useState("");
  const startedRef = useRef(false);

  // Server-rendered preview: thumbnails + page count + encryption check.
  const runPreview = useCallback(
    async (key: string, pw?: string) => {
      setStage("uploading");
      const res = await fetch("/api/import-pdf/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: key, password: pw }),
      });
      const json = (await res.json()) as PreviewResponse;
      if (json.error === "PDF_PASSWORD_REQUIRED" || json.error === "PDF_PASSWORD_WRONG") {
        setError(json.error === "PDF_PASSWORD_WRONG" ? t("pdfPasswordWrong") : null);
        setStage("password");
        return;
      }
      if (json.error || !json.data) {
        setError(json.error ?? t("importError"));
        setStage("preview");
        return;
      }
      if (pw) setPassword(pw);
      setNumPages(json.data.numPages);
      setThumbs(json.data.thumbs);
      setOrder(json.data.thumbs.map((th) => th.pageNumber));
      setStage("preview");
      if (json.data.numPages > MAX_PAGES) setError(t("pdfTooManyPages"));
    },
    [t]
  );

  // On mount: validate size, upload the PDF to the private temp bucket, preview it.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      if (file.size > MAX_PDF_BYTES) {
        setError(t("pdfTooLarge"));
        setStage("preview");
        return;
      }
      if (!user) {
        setError(t("importError"));
        setStage("preview");
        return;
      }
      try {
        const supabase = createSupabaseBrowserClient();
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_") || "rezept.pdf";
        const key = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const upload = await supabase.storage
          .from(PDF_BUCKET)
          .upload(key, file, { contentType: "application/pdf", upsert: false });
        if (upload.error) {
          setError(t("pdfUploadFailed"));
          setStage("preview");
          return;
        }
        setStorageKey(key);
        await runPreview(key);
      } catch {
        setError(t("networkError"));
        setStage("preview");
      }
    })();
  }, [file, user, t, runPreview]);

  function removePage(pageNumber: number) {
    setOrder((prev) => prev.filter((p) => p !== pageNumber));
  }

  function handleDrop(targetIdx: number) {
    setOrder((prev) => {
      if (dragIndex === null || dragIndex === targetIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function handleImportResponse(res: Response, from: "submit" | "pick") {
    const back: Stage = from === "pick" ? "picker" : "preview";
    let json: ImportResponse;
    try {
      json = (await res.json()) as ImportResponse;
    } catch {
      setError(t("invalidResponse"));
      setStage(back);
      return;
    }
    if (json.error === "PDF_PASSWORD_REQUIRED" || json.error === "PDF_PASSWORD_WRONG") {
      setError(json.error === "PDF_PASSWORD_WRONG" ? t("pdfPasswordWrong") : t("pdfPasswordRequired"));
      setStage("password");
      return;
    }
    if (json.error === "duplicate" && json.existingRecipeId) {
      setDuplicate({ id: json.existingRecipeId, title: json.existingTitle ?? null });
      setStage(back);
      return;
    }
    if (json.error || !json.data) {
      setError(json.error ?? t("importError"));
      setStage(back);
      return;
    }
    if (json.data.kind === "multi") {
      setCandidates(json.data.candidates);
      setSessionId(json.data.sessionId);
      setStage("picker");
      return;
    }
    // Single recipe → hand off to the shared review form.
    setParseResult({
      recipe: json.data.recipe,
      sourceTitle: json.data.sourceTitle,
      imageUrl: json.data.imageUrl ?? null,
    });
    setPhase("review");
  }

  async function handleSubmit() {
    if (order.length === 0) {
      setError(t("pdfNoPages"));
      return;
    }
    if (numPages > MAX_PAGES) {
      setError(t("pdfTooManyPages"));
      return;
    }
    if (!storageKey) {
      setError(t("importError"));
      return;
    }
    setError(null);
    setStage("submitting");
    try {
      const res = await fetch("/api/import-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          filename: file.name,
          pageOrder: order,
          password: password || undefined,
        }),
      });
      await handleImportResponse(res, "submit");
    } catch {
      setError(t("networkError"));
      setStage("preview");
    }
  }

  async function pick(candidateId: number) {
    setError(null);
    setStage("picking");
    try {
      const res = await fetch("/api/import-pdf/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, candidateId, password: password || undefined }),
      });
      await handleImportResponse(res, "pick");
    } catch {
      setError(t("networkError"));
      setStage("picker");
    }
  }

  const banner = (
    <>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {duplicate && (
        <p className="text-sm text-ink-secondary">
          {t("duplicateExists")}:{" "}
          <a href={`/${duplicate.id}`} className="text-forest underline hover:text-forest-deep transition-colors">
            {duplicate.title ?? t("goToRecipe")}
          </a>
        </p>
      )}
    </>
  );

  if (stage === "submitting" || stage === "picking") {
    return (
      <div className="py-4">
        <ImportProgress importType="pdf" />
      </div>
    );
  }

  if (stage === "uploading") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-sm text-ink-tertiary">
        <span className="block w-2 h-2 rounded-full bg-forest animate-pulse" />
        {t("progressPdfPreparing")}
      </div>
    );
  }

  if (stage === "password") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (storageKey) runPreview(storageKey, passwordInput);
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm text-ink-secondary">{t("pdfPasswordRequired")}</p>
        <input
          type="password"
          autoFocus
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          placeholder={t("pdfPasswordPlaceholder")}
          aria-label={t("pdfPasswordLabel")}
          className="input-field"
        />
        {banner}
        <div className="flex gap-2">
          <button type="submit" disabled={!passwordInput} className="btn-primary flex-1 py-3 disabled:opacity-50">
            {t("pdfUnlock")}
          </button>
          <button type="button" onClick={onCancel} className="text-sm text-ink-tertiary hover:text-ink-primary px-3" aria-label={t("removePdf")}>
            ✕
          </button>
        </div>
      </form>
    );
  }

  if (stage === "picker") {
    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium text-ink-primary">{t("pdfPickerTitle")}</p>
          <p className="text-xs text-ink-tertiary">{t("pdfPickerHint")}</p>
        </div>
        {banner}
        <ul className="flex flex-col gap-2">
          {candidates.map((c, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => pick(idx)}
                className="w-full text-left px-4 py-3 border border-stone rounded bg-surface-secondary hover:border-forest transition-colors"
              >
                <span className="block text-sm font-medium text-ink-primary">{c.title}</span>
                {c.shortDescription && <span className="block text-xs text-ink-tertiary mt-0.5">{c.shortDescription}</span>}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onCancel} className="self-start text-sm text-ink-tertiary hover:text-ink-primary transition-colors" aria-label={t("removePdf")}>
          ✕
        </button>
      </div>
    );
  }

  // stage === "preview"
  const thumbByPage = new Map(thumbs.map((th) => [th.pageNumber, th.dataUrl]));
  const tooManyPages = numPages > MAX_PAGES;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-4 py-3 border border-stone rounded bg-surface-secondary">
        <svg className="h-5 w-5 shrink-0 text-ink-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span className="flex-1 text-sm text-ink-primary truncate">{file.name}</span>
        <button type="button" onClick={onCancel} className="text-ink-tertiary hover:text-ink-primary transition-colors text-lg leading-none" aria-label={t("removePdf")}>
          ×
        </button>
      </div>

      {thumbs.length > 0 && (
        <div>
          <p className="text-sm font-medium text-ink-primary">{t("pdfPreviewTitle")}</p>
          <p className="text-xs text-ink-tertiary mb-2">{t("pdfPreviewHint")}</p>
          <div className="grid grid-cols-3 gap-2">
            {order.map((pageNumber, idx) => (
              <div
                key={pageNumber}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => setDragIndex(null)}
                className={`relative rounded overflow-hidden border bg-white aspect-[3/4] cursor-move ${
                  dragIndex === idx ? "border-forest opacity-60" : "border-stone"
                }`}
              >
                <span className="absolute top-1 left-1 z-10 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">{idx + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbByPage.get(pageNumber)}
                  alt={t("pdfPageAlt", { n: pageNumber, total: numPages })}
                  className="w-full h-full object-contain"
                  draggable={false}
                />
                <button
                  type="button"
                  onClick={() => removePage(pageNumber)}
                  className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/75"
                  aria-label={t("pdfRemovePage", { n: pageNumber })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {banner}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={order.length === 0 || tooManyPages}
        className="btn-primary w-full py-3 disabled:opacity-50"
      >
        {t("submitPdf")}
      </button>
    </div>
  );
}
