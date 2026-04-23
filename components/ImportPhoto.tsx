"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/types/recipe";
import RecipeReviewForm from "@/components/RecipeReviewForm";

type Phase = "input" | "loading" | "review" | "success";

interface ParseResult {
  recipe: ParsedRecipe;
  sourceTitle: string;
}

const MAX_SIDE = 1920;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
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

export default function ImportPhoto() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);

    if (!selected) { setPreview(null); return; }

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setPhase("loading");
    setError(null);

    try {
      let fileToUpload: File = file;
      try { fileToUpload = await compressImage(file); } catch { /* use original on compression error */ }

      const formData = new FormData();
      formData.append("photo", fileToUpload);

      const res = await fetch("/api/import-photo", { method: "POST", body: formData });
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
        body: JSON.stringify({ recipe, sourceTitle: parseResult.sourceTitle }),
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

  if (phase === "success") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-green-600">Rezept erfolgreich gespeichert!</p>
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setPreview(null);
            setPhase("input");
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="self-start text-xs text-purple-600 hover:underline"
        >
          Weiteres Foto importieren
        </button>
      </div>
    );
  }

  if (phase === "review" && parseResult) {
    return (
      <div className="flex flex-col gap-4">
        {preview && (
          <img
            src={preview}
            alt="Vorschau"
            className="w-full max-h-40 object-contain rounded-lg bg-gray-100"
          />
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-xl">
      <div
        role="button"
        tabIndex={0}
        onClick={() => phase !== "loading" && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && phase !== "loading" && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg overflow-hidden transition-colors ${
          phase === "loading"
            ? "opacity-50 cursor-not-allowed border-gray-200"
            : "cursor-pointer hover:border-purple-400 " +
              (preview ? "border-gray-300" : "border-gray-200")
        }`}
      >
        {preview ? (
          <img
            src={preview}
            alt="Vorschau"
            className="w-full max-h-56 object-contain bg-gray-50"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-sm font-medium">Foto auswählen</p>
            <p className="text-xs">JPG · PNG · WEBP · HEIC</p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFileChange}
          disabled={phase === "loading"}
          className="sr-only"
        />
      </div>

      {file && (
        <p className="text-xs text-gray-500 truncate">📎 {file.name}</p>
      )}

      <button
        type="submit"
        disabled={!file || phase === "loading"}
        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {phase === "loading" ? "Wird analysiert…" : "Importieren"}
      </button>

      {phase === "loading" && (
        <p className="text-xs text-gray-400">
          Claude liest das Rezeptfoto — das kann einige Sekunden dauern…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
