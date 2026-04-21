"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/types/recipe";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setError(null);
    setSuccess(false);

    if (!selected) { setPreview(null); return; }

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      let fileToUpload: File = file;
      try { fileToUpload = await compressImage(file); } catch { /* use original on compression error */ }
      const formData = new FormData();
      formData.append("photo", fileToUpload);

      const res = await fetch("/api/import-photo", { method: "POST", body: formData });
      const json = (await res.json()) as { data: Recipe | null; error: string | null };

      if (json.error) {
        setError(json.error);
      } else {
        setSuccess(true);
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-xl">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !loading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !loading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg overflow-hidden transition-colors ${
          loading
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
          disabled={loading}
          className="sr-only"
        />
      </div>

      {file && !success && (
        <p className="text-xs text-gray-500 truncate">📎 {file.name}</p>
      )}

      <button
        type="submit"
        disabled={!file || loading}
        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Wird analysiert…" : "Importieren"}
      </button>

      {loading && (
        <p className="text-xs text-gray-400">
          Claude liest das Rezeptfoto — das kann einige Sekunden dauern…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">Rezept erfolgreich importiert!</p>}
    </form>
  );
}
