"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/types/recipe";
import type { ClaudeCallMeta } from "@/lib/claude";
import RecipeReviewForm from "@/components/RecipeReviewForm";
import ImportProgress from "@/components/ImportProgress";
import { useImport } from "@/contexts/ImportContext";

type ImportType = "url" | "youtube" | "photo" | "instagram";

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
  claudeLog?: ClaudeCallMeta[];
}

interface ImageEntry {
  id: string;
  file: File;
  preview: string;
}

const MAX_IMAGES = 6;
const MAX_SIDE = 1920;
const INSTAGRAM_RE = /(?:instagram\.com|instagr\.am)\/(?:p|reel|tv)\//i;
const YOUTUBE_RE = /(?:youtube\.com|youtu\.be)/i;
const URL_RE = /^https?:\/\//i;

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

function detectType(url: string, images: ImageEntry[]): ImportType | null {
  if (images.length > 0) return "photo";
  const t = url.trim();
  if (INSTAGRAM_RE.test(t)) return "instagram";
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
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);

  // Global import state (survives navigation)
  const {
    phase, activeType, parseResult, error, duplicateId, duplicateTitle,
    setPhase, setActiveType, setParseResult, setError,
    setDuplicateId, setDuplicateTitle, reset,
  } = useImport();

  const inputType = detectType(urlInput, images);
  const canSubmit = inputType !== null && phase !== "loading";

  function addImages(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    setImages((prev) => {
      const toAdd = arr
        .filter((f) => !prev.some((e) => e.file === f))
        .slice(0, MAX_IMAGES - prev.length)
        .map((f) => ({
          id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: f,
          preview: URL.createObjectURL(f),
        }));
      return [...prev, ...toAdd];
    });
    setError(null);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) URL.revokeObjectURL(entry.preview);
      return prev.filter((e) => e.id !== id);
    });
  }

  function clearImages() {
    setImages((prev) => { prev.forEach((e) => URL.revokeObjectURL(e.preview)); return []; });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) addImages(e.dataTransfer.files);
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

      if (inputType === "photo" && images.length > 0) {
        const urls: string[] = [];
        const fileNames: string[] = [];

        for (const entry of images) {
          try {
            let file = entry.file;
            const isHeic = /image\/heic|image\/heif/i.test(file.type) || /\.heic$/i.test(file.name);
            if (!isHeic) {
              try { file = await compressImage(file); } catch { /* use original */ }
            }
            const fd = new FormData();
            fd.append("image", file);
            const res = await fetch("/api/upload-image", { method: "POST", body: fd });
            const j = (await res.json()) as { data: { url: string; fileName: string } | null; error: string | null };
            if (j.data) { urls.push(j.data.url); fileNames.push(j.data.fileName); }
          } catch { /* skip failed image */ }
        }

        if (urls.length === 0) {
          setError("Alle Bilder konnten nicht verarbeitet werden. Bitte erneut versuchen.");
          setPhase("idle");
          return;
        }

        const res = await fetch("/api/import-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls, fileNames }),
        });
        json = await safeParseJson(res);
      } else {
        const endpoint =
          inputType === "youtube" ? "/api/import-youtube" :
          inputType === "instagram" ? "/api/import-instagram" :
          "/api/import-url";
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
        if (json.claudeLog) console.log("[Claude API]", json.claudeLog);
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
    clearImages();
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
    const firstPreview = images[0]?.preview ?? null;
    return (
      <div className="flex flex-col gap-4">
        {firstPreview && (
          <img src={firstPreview} alt="Vorschau" className="w-full max-h-40 object-contain rounded bg-surface-secondary" />
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
      {/* URL input — hidden when images are selected */}
      {images.length === 0 && (
        <input
          type="text"
          value={urlInput}
          onChange={(e) => { setUrlInput(e.target.value); setError(null); }}
          placeholder="Website, YouTube- oder Instagram-Link einfügen…"
          disabled={phase === "loading"}
          className="input-field disabled:opacity-50"
        />
      )}

      {/* Image area */}
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {images.map((entry, idx) => (
            <div key={entry.id} className="relative rounded overflow-hidden bg-surface-secondary aspect-square">
              {idx === 0 && (
                <span className="absolute top-1 left-1 z-10 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}
              <img src={entry.preview} alt={entry.file.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(entry.id)}
                className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/75"
                aria-label={`${entry.file.name} entfernen`}
              >
                ×
              </button>
            </div>
          ))}
          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded border-2 border-dashed border-purple-300 bg-purple-50 flex flex-col items-center justify-center gap-1 text-purple-500 active:bg-purple-100"
              aria-label="Weiteres Bild hinzufügen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px] font-semibold leading-tight text-center px-1">Bild<br/>hinzufügen</span>
            </button>
          )}
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
        multiple
        onChange={(e) => { if (e.target.files) addImages(e.target.files); }}
        className="sr-only"
      />

      <button type="submit" disabled={!canSubmit} className="btn-primary w-full py-3">
        {phase === "loading"
          ? "Wird analysiert…"
          : images.length > 1
          ? `Importieren (${images.length} Bilder)`
          : "Rezept importieren"}
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
          Website, YouTube-, Instagram-Link oder Foto eines Rezepts
        </p>
      )}
    </form>
  );
}
