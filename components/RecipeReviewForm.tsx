"use client";

import { useState } from "react";
import type { ParsedRecipe } from "@/types/recipe";

interface DraftIngredient { amount: string; unit: string; name: string }
interface DraftStep { text: string; timerSeconds: number | null }

interface Props {
  initial: ParsedRecipe;
  saving: boolean;
  error: string | null;
  onSave: (recipe: ParsedRecipe) => void;
  onDiscard: () => void;
}

export default function RecipeReviewForm({ initial, saving, error, onSave, onDiscard }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [servings, setServings] = useState(String(initial.servings));
  const [prepTime, setPrepTime] = useState(String(initial.prepTime));
  const [cookTime, setCookTime] = useState(String(initial.cookTime));
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(
    initial.ingredients.map((i) => ({ amount: String(i.amount), unit: i.unit, name: i.name }))
  );
  const [steps, setSteps] = useState<DraftStep[]>(
    initial.steps.map((s) => ({ text: s.text, timerSeconds: s.timerSeconds }))
  );
  const [tagsInput, setTagsInput] = useState(initial.tags.join(", "));

  function handleSave() {
    onSave({
      title: title.trim(),
      servings: parseInt(servings) || 0,
      prepTime: parseInt(prepTime) || 0,
      cookTime: parseInt(cookTime) || 0,
      ingredients: ingredients
        .map((i) => ({ amount: parseFloat(i.amount) || 0, unit: i.unit, name: i.name }))
        .filter((i) => i.name.trim() !== ""),
      steps: steps
        .filter((s) => s.text.trim() !== "")
        .map((s, idx) => ({ order: idx + 1, text: s.text, timerSeconds: s.timerSeconds })),
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      source: initial.source,
    });
  }

  function updateIngredient(idx: number, field: keyof DraftIngredient, value: string) {
    setIngredients((prev) => prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)));
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, text: value } : s)));
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  const inputCls =
    "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="flex flex-col gap-5 border border-gray-200 rounded-xl p-5 bg-gray-50">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Rezept überprüfen &amp; bearbeiten
      </p>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          className={inputCls}
        />
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Portionen", value: servings, set: setServings },
          { label: "Vorbereitung (Min.)", value: prepTime, set: setPrepTime },
          { label: "Kochen (Min.)", value: cookTime, set: setCookTime },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
            <input
              type="number"
              value={value}
              onChange={(e) => set(e.target.value)}
              min={0}
              disabled={saving}
              className={inputCls}
            />
          </div>
        ))}
      </div>

      {/* Ingredients */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Zutaten</label>
        <div className="flex flex-col gap-1.5">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="number"
                value={ing.amount}
                onChange={(e) => updateIngredient(idx, "amount", e.target.value)}
                placeholder="Menge"
                min={0}
                disabled={saving}
                className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={ing.unit}
                onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                placeholder="Einheit"
                disabled={saving}
                className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                placeholder="Zutat"
                disabled={saving}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => removeIngredient(idx)}
                disabled={saving}
                className="text-gray-400 hover:text-red-500 text-lg leading-none disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setIngredients((prev) => [...prev, { amount: "", unit: "", name: "" }])}
            disabled={saving}
            className="self-start text-xs text-blue-600 hover:underline mt-1 disabled:opacity-40"
          >
            + Zutat hinzufügen
          </button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Schritte</label>
        <div className="flex flex-col gap-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="text-xs text-gray-400 mt-2 w-5 shrink-0 text-right">{idx + 1}.</span>
              <textarea
                value={step.text}
                onChange={(e) => updateStep(idx, e.target.value)}
                rows={2}
                disabled={saving}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
              <button
                type="button"
                onClick={() => removeStep(idx)}
                disabled={saving}
                className="text-gray-400 hover:text-red-500 text-lg leading-none mt-1.5 disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSteps((prev) => [...prev, { text: "", timerSeconds: null }])}
            disabled={saving}
            className="self-start text-xs text-blue-600 hover:underline mt-1 disabled:opacity-40"
          >
            + Schritt hinzufügen
          </button>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Tags <span className="font-normal text-gray-400">(kommagetrennt)</span>
        </label>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="pasta, vegetarisch, schnell"
          disabled={saving}
          className={inputCls}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Wird gespeichert…" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Verwerfen
        </button>
      </div>
    </div>
  );
}
