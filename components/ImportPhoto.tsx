"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/types/recipe";
import RecipeReviewForm from "@/components/RecipeReviewForm";

const MAX_IMAGES = 6;
const MAX_SIDE = 1920;

interface ImageEntry {
  id: string;
  file: File;
  preview: string;
}

interface ParseResult {
  recipe: ParsedRecipe;
  sourceTitle: string;
  imageUrl: string | null;
}

type Phase = "input" | "uploading" | "analyzing" | "review" | "success";

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width >= height) {
          height = Math.round(height * (MAX_SIDE / width));
          width = MAX_SIDE;
        } else {
          width = Math.round(width * (MAX_SIDE / height));
          height = MAX_SIDE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export default function ImportPhoto() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [phase, setPhase] = useState<Phase>("input");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [skippedCount, setSkippedCount] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function addFiles(newFiles: FileList | File[]) {
    const arr = Array.from(newFiles);
    setImages((prev) => {
      const existing = new Set(prev.map((e) => e.file.name));
      const toAdd = arr
        .filter((f) => !existing.has(f.name))
        .slice(0, MAX_IMAGES - prev.length)
        .map((f) => ({
          id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  function swapImages(aId: string, bId: string) {
    setImages((prev) => {
      const next = [...prev];
      const ai = next.findIndex((i) => i.id === aId);
      const bi = next.findIndex((i) => i.id === bId);
      if (ai === -1 || bi === -1) return prev;
      [next[ai], next[bi]] = [next[bi], next[ai]];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (images.length === 0) return;

    setPhase("uploading");
    setUploadProgress({ done: 0, total: images.length });
    setError(null);
    setSkippedCount(0);

    const urls: string[] = [];
    const fileNames: string[] = [];
    let skipped = 0;

    for (let i = 0; i < images.length; i++) {
      const entry = images[i];
      try {
        let file = entry.file;
        const isHeic = /image\/heic|image\/heif/i.test(file.type) || /\.heic$/i.test(file.name);
        if (!isHeic) {
          try { file = await compressImage(file); } catch { /* use original */ }
        }
        const formData = new FormData();
        formData.append("image", file);
        const res = await fetch("/api/upload-image", { method: "POST", body: formData });
        const json = (await res.json()) as {
          data: { url: string; fileName: string } | null;
          error: string | null;
        };
        if (json.data) {
          urls.push(json.data.url);
          fileNames.push(json.data.fileName);
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
      setUploadProgress({ done: i + 1, total: images.length });
    }

    if (skipped > 0) setSkippedCount(skipped);

    if (urls.length === 0) {
      setError("Alle Bilder konnten nicht verarbeitet werden. Bitte erneut versuchen.");
      setPhase("input");
      return;
    }

    setPhase("analyzing");
    try {
      const res = await fetch("/api/import-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, fileNames }),
      });
      const json = (await res.json()) as { data: ParseResult | null; error: string | null };

      if (json.error || !json.data) {
        setError(json.error ?? "Import fehlgeschlagen");
        setPhase("input");
      } else {
        setParseResult(json.data);
        setPhase("review");
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
      setPhase("input");
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
          imageUrl: parseResult.imageUrl,
        }),
      });
      const json = (await res.json()) as { data: unknown; error: string | null };
      if (json.error) {
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
    setPhase("input");
  }

  function reset() {
    images.forEach((e) => URL.revokeObjectURL(e.preview));
    setImages([]);
    setParseResult(null);
    setError(null);
    setSkippedCount(0);
    setPhase("input");
    if (inputRef.current) inputRef.current.value = "";
  }

  const loading = phase === "uploading" || phase === "analyzing";

  if (phase === "success") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-green-600">Rezept erfolgreich gespeichert!</p>
        <button type="button" onClick={reset} className="self-start text-xs text-purple-600 hover:underline">
          Weiteres Foto importieren
        </button>
      </div>
    );
  }

  if (phase === "review" && parseResult) {
    return (
      <RecipeReviewForm
        initial={parseResult.recipe}
        saving={saving}
        error={error}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-xl">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !loading && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className={`border-2 border-dashed rounded-lg transition-colors select-none ${
          loading
            ? "opacity-50 cursor-not-allowed border-gray-200"
            : images.length > 0
            ? "cursor-pointer border-gray-200 hover:border-purple-400 py-3 px-4"
            : "cursor-pointer border-gray-200 hover:border-purple-400"
        }`}
      >
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium">Fotos auswählen oder hierher ziehen</p>
            <p className="text-xs">Bis zu {MAX_IMAGES} Bilder · JPG · PNG · WEBP · HEIC</p>
          </div>
        ) : (
          <div className="text-xs text-gray-400">
            {images.length} / {MAX_IMAGES} Bild{images.length !== 1 ? "er" : ""}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          disabled={loading || images.length >= MAX_IMAGES}
          className="sr-only"
        />
      </div>

      {/* Thumbnail grid + add-more button (shown separately for iOS Safari compat) */}
      {images.length > 0 && (
        <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {images.map((entry, idx) => (
            <div
              key={entry.id}
              draggable={!loading}
              onDragStart={(e) => { e.stopPropagation(); setDraggingId(entry.id); }}
              onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId(entry.id); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggingId && draggingId !== entry.id) swapImages(draggingId, entry.id);
                setDraggingId(null);
                setDragOverId(null);
              }}
              className={`relative rounded overflow-hidden bg-gray-100 aspect-square group ${
                loading ? "cursor-default" : "cursor-grab active:cursor-grabbing"
              } ${draggingId === entry.id ? "opacity-40" : ""} ${
                dragOverId === entry.id && draggingId !== entry.id
                  ? "ring-2 ring-purple-400"
                  : ""
              }`}
            >
              {idx === 0 && (
                <span className="absolute top-1 left-1 z-10 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded">
                  Cover
                </span>
              )}
              <img
                src={entry.preview}
                alt={entry.file.name}
                className="w-full h-full object-cover pointer-events-none"
              />
              {!loading && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(entry.id); }}
                  className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/75"
                  aria-label={`${entry.file.name} entfernen`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {images.length < MAX_IMAGES && !loading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 self-start text-sm text-purple-600 hover:text-purple-700 font-medium py-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Bild hinzufügen ({images.length}/{MAX_IMAGES})
          </button>
        )}
        </div>
      )}

      {/* Status messages */}
      {phase === "uploading" && (
        <p className="text-xs text-gray-400">
          Wird hochgeladen… ({uploadProgress.done}/{uploadProgress.total})
        </p>
      )}
      {phase === "analyzing" && (
        <p className="text-xs text-gray-400">
          Claude liest {images.length > 1 ? "die Rezeptfotos" : "das Rezeptfoto"} — das kann einige Sekunden dauern…
        </p>
      )}
      {skippedCount > 0 && (
        <p className="text-xs text-amber-600">
          {skippedCount} Bild{skippedCount !== 1 ? "er konnten" : " konnte"} nicht verarbeitet werden und {skippedCount !== 1 ? "wurden" : "wurde"} übersprungen.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={images.length === 0 || loading}
        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading
          ? "Wird verarbeitet…"
          : `Importieren${images.length > 1 ? ` (${images.length} Bilder)` : ""}`}
      </button>
    </form>
  );
}
