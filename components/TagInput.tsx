"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { getTagColor, getTagKeys } from "@/lib/tag-colors";

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function TagInput({ value, onChange, disabled, placeholder }: Props) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tagKeys = useMemo(() => getTagKeys(), []);
  const trimmed = input.trim();
  const lowerTrimmed = trimmed.toLowerCase();

  const suggestions = useMemo(() => {
    if (!lowerTrimmed) return [];
    const existing = new Set(value.map((v) => v.toLowerCase()));
    return tagKeys
      .filter((k) => k.toLowerCase().includes(lowerTrimmed) && !existing.has(k.toLowerCase()))
      .slice(0, 8);
  }, [lowerTrimmed, tagKeys, value]);

  const previewColor = trimmed ? getTagColor(trimmed) : null;

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, t]);
    setInput("");
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeTag(value.length - 1);
    } else if (e.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-2 p-2 border border-stone rounded bg-white focus-within:border-ink-tertiary transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => {
          const { bg, text } = getTagColor(tag);
          return (
            <span
              key={`${tag}-${i}`}
              style={{ backgroundColor: bg, color: text }}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(i);
                }}
                disabled={disabled}
                aria-label={`Tag "${tag}" entfernen`}
                className="leading-none px-0.5 hover:opacity-60 disabled:opacity-40"
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 150);
            if (input.trim()) addTag(input);
          }}
          disabled={disabled}
          placeholder={value.length === 0 ? (placeholder ?? "Tag eingeben…") : ""}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-ink-tertiary"
        />
        {previewColor && (
          <span
            style={{ backgroundColor: previewColor.bg, color: previewColor.text }}
            className="text-xs px-2 py-0.5 rounded opacity-70"
            aria-hidden="true"
          >
            {trimmed}
          </span>
        )}
      </div>

      {focused && suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 border border-stone rounded bg-white max-h-48 overflow-y-auto text-sm shadow-sm">
          {suggestions.map((s) => {
            const { bg, text } = getTagColor(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-surface-hover flex items-center gap-2"
                >
                  <span
                    style={{ backgroundColor: bg, color: text }}
                    className="text-xs px-2 py-0.5 rounded"
                  >
                    {s}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
