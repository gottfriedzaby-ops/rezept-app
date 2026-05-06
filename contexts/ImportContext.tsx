"use client";

import { createContext, useContext, useState } from "react";
import type { ParsedRecipe } from "@/types/recipe";

type Phase = "idle" | "loading" | "review" | "success";
type ImportType = "url" | "youtube" | "photo" | "instagram" | "pdf";

export interface ParseResult {
  recipe: ParsedRecipe;
  sourceTitle: string;
  stepImages?: string[];
  imageUrl?: string | null;
}

interface ImportState {
  phase: Phase;
  activeType: ImportType | null;
  parseResult: ParseResult | null;
  error: string | null;
  duplicateId: string | null;
  duplicateTitle: string | null;
  setPhase: (p: Phase) => void;
  setActiveType: (t: ImportType | null) => void;
  setParseResult: (r: ParseResult | null) => void;
  setError: (e: string | null) => void;
  setDuplicateId: (id: string | null) => void;
  setDuplicateTitle: (t: string | null) => void;
  reset: () => void;
}

const ImportContext = createContext<ImportState | null>(null);

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeType, setActiveType] = useState<ImportType | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);

  function reset() {
    setPhase("idle");
    setActiveType(null);
    setParseResult(null);
    setError(null);
    setDuplicateId(null);
    setDuplicateTitle(null);
  }

  return (
    <ImportContext.Provider
      value={{
        phase,
        activeType,
        parseResult,
        error,
        duplicateId,
        duplicateTitle,
        setPhase,
        setActiveType,
        setParseResult,
        setError,
        setDuplicateId,
        setDuplicateTitle,
        reset,
      }}
    >
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport must be used inside ImportProvider");
  return ctx;
}
