"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/types/recipe";
import RecipeReviewForm from "@/components/RecipeReviewForm";
import ImportProgress from "@/components/ImportProgress";
import { useImport } from "@/contexts/ImportContext";

type ImportType = "url" | "youtube" | "photo";

interface ImportApiResponse {
  data: {
    recipe: ParsedRecipe;
    sourceTitle: string;
    stepImages?: string[];
    imageUrl?: string | null;
  } | null;
  error: string | null;
  existingRecipeId?: string;
  existingTitle?: string;
}

const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/i;
const URL_RE = /^https?:\/\//i;
const MAX_SIDE = 1920;

async function safeParseJson(res: Response): Promise<ImportApiResponse> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const body = await res.text().catch(() => "");
    console.error("[safeParseJson] non-JSON response", res.status, body.slice(0, 200));
    return { data: null, error: `Server-Fehler (${res.status})` };
  }
  try {
    return await res.json();
  } catch {
    return { data: null, error: "Ungültige Server-Antwort" };
  }
}

function detectType(url: string, file: File | null): ImportType | null {
  if (file) return "photo";
  const t = url.trim();
  if (YOUTUBE_RE.test(t)) return "youtube";
  if (URL_RE.test(t)) return "url";
  return null;
}

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width >= height) { height = Math.round(height * (MAX_SIDE / width)); width = MAX_SIDE; }
        else { width = Math.round(width * (MAX_SIDE / height)); height = MAX_SIDE; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas nicht verfügbar")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Komprimierung fehlgeschlagen")); return; }
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Bild konnte nicht geladen werden")); };
    img.src = objectUrl;
  });
}


export default function ImportUnified() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI-local state (doesn't need to survive navigation)
  const [urlInput, setUrlInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  // Global import state (survives navigation)
  const {
    phase, activeType, parseResult, error, duplicateId, duplicateTitle,
    setPhase, setActiveType, setParseResult, setError,
    setDuplicateId, setDuplicateTitle, reset,
  } = useImport();

  const inputType = detectType(urlInput, file);
  const canSubmit = inputType !== null && phase !== "loading";

  function applyFile(f: File) {
    setFile(f);
    setUrlInput("");
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("image/")) applyFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputType) return;

    setPhase("loading");
    setActiveType(inputType);
    setError(null);
    setDuplicateId(null);
    setDuplicateTitle(null);

    try {
      let json: ImportApiResponse;

      if (inputType === "photo" && file) {
        let fileToUpload = file;
        try { fileToUpload = await compressImage(file); } catch { /* use original */ }
        const formData = new FormData();
        formData.append("photo", fileToUpload);
        const res = await fetch("/api/import-photo", { method: "POST", body: formData });
        json = await safeParseJson(res);
      } else {
        const endpoint = inputType === "youtube" ? "/api/import-youtube" : "/api/import-url";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        json = await safeParseJson(res);
      }

      if (json.error === "duplicate" && json.existingRecipeId) {
        setDuplicateId(json.existingRecipeId);
        setDuplicateTitle(json.existingTitle ?? null);
        setPhase("idle");
      } else if (json.error || !json.data) {
        setError(json.error ?? "Import fehlgeschlagen");
        setPhase("idle");
      } else {
        setParseResult(json.data);
        setPhase("review");
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
      setPhase("idle");
    }
  }

  async function handleSave(recipe: ParsedRecipe) {
    if (!parseResult) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/recipes/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe,
          sourceTitle: parseResult.sourceTitle,
          stepImages: parseResult.stepImages ?? [],
          imageUrl: parseResult.imageUrl ?? null,
        }),
      });
      const json = (await res.json()) as ImportApiResponse;

      if (json.error === "duplicate" && json.existingRecipeId) {
        setDuplicateId(json.existingRecipeId);
        setDuplicateTitle(json.existingTitle ?? null);
        setPhase("idle");
        setParseResult(null);
      } else if (json.error) {
        setError(json.error);
      } else {
        setPhase("success");
        router.refresh();
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setParseResult(null);
    setError(null);
    setDuplicateId(null);
    setDuplicateTitle(null);
    setPhase("idle");
  }

  function handleReset() {
    setUrlInput("");
    clearFile();
    reset();
  }

  if (phase === "loading" && activeType) {
    return (
      <div className="py-4">
        <ImportProgress importType={activeType} />
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-forest font-medium">Rezept gespeichert.</p>
        <button type="button" onClick={handleReset} className="self-start text-sm text-ink-tertiary hover:text-ink-primary transition-colors">
          Weiteres Rezept importieren →
        </button>
      </div>
    );
  }

  if (phase === "review" && parseResult) {
    return (
      <div className="flex flex-col gap-4">
        {preview && (
          <img src={preview} alt="Vorschau" className="w-full max-h-40 object-contain rounded bg-surface-secondary" />
        )}
        <RecipeReviewForm
          initial={parseResult.recipe}
          saving={saving}
          error={error}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col gap-4 transition-colors rounded ${
        isDragging ? "outline outline-2 outline-forest/30 bg-forest-soft" : ""
      }`}
    >
      {/* URL input — hidden when file is active */}
      {!file && (
        <input
          type="text"
          value={urlInput}
          onChange={(e) => { setUrlInput(e.target.value); setError(null); }}
          placeholder="Website oder YouTube-Link einfügen…"
          disabled={phase === "loading"}
          className="input-field disabled:opacity-50"
        />
      )}

      {/* File area */}
      {file && preview ? (
        <div className="relative">
          <img src={preview} alt="Vorschau" className="w-full max-h-48 object-contain rounded bg-surface-secondary" />
          <button
            type="button"
            onClick={clearFile}
            disabled={phase === "loading"}
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-white rounded border border-stone text-ink-secondary hover:text-ink-primary text-base leading-none shadow-sm disabled:opacity-40"
          >
            ×
          </button>
          <p className="text-xs text-ink-tertiary truncate mt-2">{file.name}</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-stone" />
            <span className="text-xs text-ink-tertiary">oder</span>
            <div className="flex-1 h-px bg-stone" />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={phase === "loading"}
            className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3.5 border border-dashed border-stone rounded text-sm text-ink-tertiary hover:border-ink-secondary hover:text-ink-secondary transition-colors disabled:opacity-50"
          >
            <svg className="h-4 w-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Foto hochladen
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFile(f); }}
        className="sr-only"
      />

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-3">
        {phase === "loading" ? "Wird analysiert…" : "Rezept importieren"}
      </button>

      {duplicateId && (
        <p className="text-sm text-ink-secondary">
          Dieses Rezept existiert bereits:{" "}
          <a
            href={`/${duplicateId}`}
            className="text-forest underline hover:text-forest-deep transition-colors"
          >
            {duplicateTitle ?? "Zum Rezept"}
          </a>
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {phase !== "loading" && (
        <p className="text-xs text-ink-tertiary text-center">
          Website, YouTube-Link oder Foto eines Rezepts
        </p>
      )}
    </form>
  );
}
