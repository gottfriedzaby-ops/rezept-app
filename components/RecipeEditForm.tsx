"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/types/recipe";

interface DraftIngredient { amount: string; unit: string; name: string }
interface DraftStep { text: string; timerSeconds: number | null }

function scaleAmount(amount: number, factor: number): string {
  return String(parseFloat((amount * factor).toPrecision(6)));
}

export default function RecipeEditForm({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const initServings = (recipe.servings ?? 0) > 0 ? recipe.servings! : 1;

  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [servings, setServings] = useState(recipe.servings ? String(recipe.servings) : "");
  const [prepTime, setPrepTime] = useState(String(recipe.prep_time ?? 0));
  const [cookTime, setCookTime] = useState(String(recipe.cook_time ?? 0));
  const [imageUrl, setImageUrl] = useState(recipe.image_url ?? "");
  const [ingredients, setIngredients] = useState<DraftIngredient[]>(
    recipe.ingredients.map((i) => ({
      amount: scaleAmount(i.amount, initServings),
      unit: i.unit,
      name: i.name,
    }))
  );
  const [steps, setSteps] = useState<DraftStep[]>(
    recipe.steps.map((s) => ({ text: s.text, timerSeconds: s.timerSeconds }))
  );
  const [tagsInput, setTagsInput] = useState(recipe.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentServings = parseInt(servings);
  const showServingsWarning = isNaN(currentServings) || currentServings <= 0;

  async function handleSave() {
    const sv = currentServings > 0 ? currentServings : 1;
    setSaving(true);
    setError(null);

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      servings: sv,
      prep_time: parseInt(prepTime) || 0,
      cook_time: parseInt(cookTime) || 0,
      ingredients: ingredients
        .map((i) => ({ amount: (parseFloat(i.amount) || 0) / sv, unit: i.unit, name: i.name }))
        .filter((i) => i.name.trim() !== ""),
      steps: steps
        .filter((s) => s.text.trim() !== "")
        .map((s, idx) => ({ order: idx + 1, text: s.text, timerSeconds: s.timerSeconds })),
      tags: tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      image_url: imageUrl.trim() || null,
    };

    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setSaving(false);
      } else {
        router.push(`/${recipe.id}`);
      }
    } catch {
      setError("Netzwerkfehler. Bitte erneut versuchen.");
      setSaving(false);
    }
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

  const fieldCls = "input-field";
  const smallCls = "w-full px-3 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors";
  const rmCls = "text-ink-tertiary hover:text-ink-primary transition-colors text-lg leading-none disabled:opacity-40";

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <div>
        <label className="block text-xs text-ink-tertiary mb-1.5">Titel</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} className={fieldCls} />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs text-ink-tertiary mb-1.5">Beschreibung <span className="text-ink-tertiary/60">(optional)</span></label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={saving}
          placeholder="Kurze Beschreibung des Rezepts…"
          className="w-full px-3 py-2 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors resize-y"
        />
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-ink-tertiary mb-1.5">
            Portionen{showServingsWarning && <span className="text-amber-600 ml-0.5">*</span>}
          </label>
          <input
            type="number"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            min={1}
            placeholder="z.B. 4"
            disabled={saving}
            className={`${smallCls} ${showServingsWarning ? "border-amber-400 bg-amber-50/50" : ""}`}
          />
        </div>
        {[
          { label: "Vorbereitung (Min.)", value: prepTime, set: setPrepTime },
          { label: "Kochen (Min.)", value: cookTime, set: setCookTime },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-xs text-ink-tertiary mb-1.5">{label}</label>
            <input type="number" value={value} onChange={(e) => set(e.target.value)} min={0} disabled={saving} className={smallCls} />
          </div>
        ))}
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label className="text-xs text-ink-tertiary">
            Zutaten für{" "}
            <span className={`font-medium ${showServingsWarning ? "text-amber-600" : "text-ink-primary"}`}>
              {showServingsWarning ? "?" : currentServings}
            </span>{" "}
            Portionen
          </label>
        </div>
        {showServingsWarning && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
            Die Portionsangabe fehlt. Bitte ergänze sie, damit die Mengen korrekt skaliert werden können.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {ingredients.map((ing, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input type="number" value={ing.amount} onChange={(e) => updateIngredient(idx, "amount", e.target.value)} placeholder="Menge" min={0} step="any" disabled={saving} className="w-20 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors" />
              <input type="text" value={ing.unit} onChange={(e) => updateIngredient(idx, "unit", e.target.value)} placeholder="Einheit" disabled={saving} className="w-20 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors" />
              <input type="text" value={ing.name} onChange={(e) => updateIngredient(idx, "name", e.target.value)} placeholder="Zutat" disabled={saving} className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors" />
              <button type="button" onClick={() => removeIngredient(idx)} disabled={saving} className={rmCls}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setIngredients((p) => [...p, { amount: "", unit: "", name: "" }])} disabled={saving} className="self-start text-xs text-forest hover:text-forest-deep transition-colors mt-1 disabled:opacity-40">
            + Zutat hinzufügen
          </button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <label className="block text-xs text-ink-tertiary mb-2">Schritte</label>
        <div className="flex flex-col gap-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <span className="text-xs text-ink-tertiary mt-2 w-5 shrink-0 text-right tabular-nums">{idx + 1}.</span>
              <textarea value={step.text} onChange={(e) => updateStep(idx, e.target.value)} rows={2} disabled={saving} className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary focus:outline-none focus:border-ink-secondary transition-colors resize-y" />
              <button type="button" onClick={() => removeStep(idx)} disabled={saving} className={`${rmCls} mt-1.5`}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setSteps((p) => [...p, { text: "", timerSeconds: null }])} disabled={saving} className="self-start text-xs text-forest hover:text-forest-deep transition-colors mt-1 disabled:opacity-40">
            + Schritt hinzufügen
          </button>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs text-ink-tertiary mb-1.5">Tags <span className="text-ink-tertiary/60">(kommagetrennt)</span></label>
        <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="pasta, vegetarisch, schnell" disabled={saving} className={fieldCls} />
      </div>

      {/* Cover image URL */}
      <div>
        <label className="block text-xs text-ink-tertiary mb-1.5">Titelbild-URL <span className="text-ink-tertiary/60">(optional)</span></label>
        <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" disabled={saving} className={fieldCls} />
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary">
          {saving ? "Wird gespeichert…" : "Änderungen speichern"}
        </button>
        <button type="button" onClick={() => router.back()} disabled={saving} className="btn-ghost">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
