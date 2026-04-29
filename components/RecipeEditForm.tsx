"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe, RecipeType } from "@/types/recipe";
import { getRecipeSections } from "@/types/recipe";

interface DraftIngredient { amount: string; unit: string; name: string }
interface DraftStep { text: string; timerSeconds: number | null }
interface DraftSection { title: string; ingredients: DraftIngredient[]; steps: DraftStep[] }

function scaleAmount(amount: number, factor: number): string {
  return String(parseFloat((amount * factor).toPrecision(6)));
}

const RECIPE_TYPES: { value: RecipeType; label: string; emoji: string }[] = [
  { value: "kochen", label: "Kochen", emoji: "🍳" },
  { value: "backen", label: "Backen", emoji: "🍞" },
  { value: "grillen", label: "Grillen", emoji: "🔥" },
  { value: "zubereiten", label: "Zubereiten", emoji: "🥗" },
];

export default function RecipeEditForm({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const initServings = (recipe.servings ?? 0) > 0 ? recipe.servings! : 1;

  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [recipeType, setRecipeType] = useState<RecipeType>(recipe.recipe_type);
  const [servings, setServings] = useState(recipe.servings ? String(recipe.servings) : "");
  const [prepTime, setPrepTime] = useState(String(recipe.prep_time ?? 0));
  const [cookTime, setCookTime] = useState(String(recipe.cook_time ?? 0));
  const [imageUrl, setImageUrl] = useState(recipe.image_url ?? "");
  const [sections, setSections] = useState<DraftSection[]>(
    getRecipeSections(recipe).map((s) => ({
      title: s.title ?? "",
      ingredients: s.ingredients.map((i) => ({
        amount: scaleAmount(i.amount, initServings),
        unit: i.unit,
        name: i.name,
      })),
      steps: s.steps.map((st) => ({ text: st.text, timerSeconds: st.timerSeconds })),
    }))
  );
  const [tagsInput, setTagsInput] = useState(recipe.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentServings = parseInt(servings);
  const showServingsWarning = isNaN(currentServings) || currentServings <= 0;
  const multiSection = sections.length > 1 || (sections[0]?.title ?? "") !== "";

  async function handleSave() {
    const sv = currentServings > 0 ? currentServings : 1;
    setSaving(true);
    setError(null);

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      recipe_type: recipeType,
      servings: sv,
      prep_time: parseInt(prepTime) || 0,
      cook_time: parseInt(cookTime) || 0,
      sections: sections.map((s) => ({
        title: s.title.trim() || null,
        ingredients: s.ingredients
          .map((i) => ({ amount: (parseFloat(i.amount) || 0) / sv, unit: i.unit, name: i.name }))
          .filter((i) => i.name.trim() !== ""),
        steps: s.steps
          .filter((st) => st.text.trim() !== "")
          .map((st, idx) => ({ order: idx + 1, text: st.text, timerSeconds: st.timerSeconds })),
      })),
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

  function updateIngredient(sIdx: number, iIdx: number, field: keyof DraftIngredient, value: string) {
    setSections((prev) => prev.map((s, si) =>
      si !== sIdx ? s : {
        ...s,
        ingredients: s.ingredients.map((ing, ii) => ii !== iIdx ? ing : { ...ing, [field]: value }),
      }
    ));
  }

  function removeIngredient(sIdx: number, iIdx: number) {
    setSections((prev) => prev.map((s, si) =>
      si !== sIdx ? s : { ...s, ingredients: s.ingredients.filter((_, ii) => ii !== iIdx) }
    ));
  }

  function addIngredient(sIdx: number) {
    setSections((prev) => prev.map((s, si) =>
      si !== sIdx ? s : { ...s, ingredients: [...s.ingredients, { amount: "", unit: "", name: "" }] }
    ));
  }

  function updateStep(sIdx: number, stIdx: number, value: string) {
    setSections((prev) => prev.map((s, si) =>
      si !== sIdx ? s : {
        ...s,
        steps: s.steps.map((st, sti) => sti !== stIdx ? st : { ...st, text: value }),
      }
    ));
  }

  function removeStep(sIdx: number, stIdx: number) {
    setSections((prev) => prev.map((s, si) =>
      si !== sIdx ? s : { ...s, steps: s.steps.filter((_, sti) => sti !== stIdx) }
    ));
  }

  function addStep(sIdx: number) {
    setSections((prev) => prev.map((s, si) =>
      si !== sIdx ? s : { ...s, steps: [...s.steps, { text: "", timerSeconds: null }] }
    ));
  }

  function moveSection(sIdx: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev];
      const target = sIdx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[sIdx], next[target]] = [next[target], next[sIdx]];
      return next;
    });
  }

  function removeSection(sIdx: number) {
    const s = sections[sIdx];
    const hasContent = s.ingredients.some((i) => i.name.trim()) || s.steps.some((st) => st.text.trim());
    if (hasContent && !window.confirm("Abschnitt wirklich löschen? Alle Zutaten und Schritte dieses Abschnitts gehen verloren.")) return;
    setSections((prev) => prev.filter((_, i) => i !== sIdx));
  }

  function addSection() {
    setSections((prev) => [...prev, { title: "", ingredients: [{ amount: "", unit: "", name: "" }], steps: [{ text: "", timerSeconds: null }] }]);
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

      {/* Recipe type */}
      <div>
        <label className="block text-xs text-ink-tertiary mb-1.5">Rezepttyp</label>
        <div className="flex gap-2 flex-wrap">
          {RECIPE_TYPES.map(({ value, label, emoji }) => (
            <button
              key={value}
              type="button"
              onClick={() => setRecipeType(value)}
              disabled={saving}
              className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                recipeType === value
                  ? "bg-ink-primary text-white border-ink-primary"
                  : "bg-white text-ink-secondary border-stone hover:bg-surface-hover"
              }`}
            >
              {emoji} {label}
            </button>
          ))}
        </div>
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

      {showServingsWarning && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 -mt-3">
          Die Portionsangabe fehlt. Bitte ergänze sie, damit die Mengen korrekt skaliert werden können.
        </p>
      )}

      {/* Sections */}
      {sections.map((section, sIdx) => (
        <div key={sIdx} className={multiSection ? "border border-stone rounded p-4 flex flex-col gap-4" : "flex flex-col gap-4"}>
          {multiSection && (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={section.title}
                onChange={(e) => setSections((prev) => prev.map((s, i) => i !== sIdx ? s : { ...s, title: e.target.value }))}
                placeholder="Abschnitt (z.B. Für den Teig)"
                disabled={saving}
                className="flex-1 font-medium text-sm px-2.5 py-1.5 bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors"
              />
              <button
                type="button"
                onClick={() => moveSection(sIdx, -1)}
                disabled={saving || sIdx === 0}
                className="px-2 py-1 text-ink-tertiary hover:text-ink-primary disabled:opacity-30 text-sm"
                title="Nach oben"
              >↑</button>
              <button
                type="button"
                onClick={() => moveSection(sIdx, 1)}
                disabled={saving || sIdx === sections.length - 1}
                className="px-2 py-1 text-ink-tertiary hover:text-ink-primary disabled:opacity-30 text-sm"
                title="Nach unten"
              >↓</button>
              <button
                type="button"
                onClick={() => removeSection(sIdx)}
                disabled={saving || sections.length === 1}
                className="px-2 py-1 text-ink-tertiary hover:text-red-600 disabled:opacity-30 text-sm"
                title="Abschnitt entfernen"
              >×</button>
            </div>
          )}

          {/* Ingredients */}
          <div>
            <label className="block text-xs text-ink-tertiary mb-2">
              Zutaten für{" "}
              <span className={`font-medium ${showServingsWarning ? "text-amber-600" : "text-ink-primary"}`}>
                {showServingsWarning ? "?" : currentServings}
              </span>{" "}
              Portionen
            </label>
            <div className="flex flex-col gap-2">
              {section.ingredients.map((ing, iIdx) => (
                <div key={iIdx} className="flex gap-2 items-center">
                  <input type="number" value={ing.amount} onChange={(e) => updateIngredient(sIdx, iIdx, "amount", e.target.value)} placeholder="Menge" min={0} step="any" disabled={saving} className="w-20 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors" />
                  <input type="text" value={ing.unit} onChange={(e) => updateIngredient(sIdx, iIdx, "unit", e.target.value)} placeholder="Einheit" disabled={saving} className="w-20 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors" />
                  <input type="text" value={ing.name} onChange={(e) => updateIngredient(sIdx, iIdx, "name", e.target.value)} placeholder="Zutat" disabled={saving} className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-ink-secondary transition-colors" />
                  <button type="button" onClick={() => removeIngredient(sIdx, iIdx)} disabled={saving} className={rmCls}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => addIngredient(sIdx)} disabled={saving} className="self-start text-xs text-forest hover:text-forest-deep transition-colors mt-1 disabled:opacity-40">
                + Zutat hinzufügen
              </button>
            </div>
          </div>

          {/* Steps */}
          <div>
            <label className="block text-xs text-ink-tertiary mb-2">Schritte</label>
            <div className="flex flex-col gap-2">
              {section.steps.map((step, stIdx) => (
                <div key={stIdx} className="flex gap-2 items-start">
                  <span className="text-xs text-ink-tertiary mt-2 w-5 shrink-0 text-right tabular-nums">{stIdx + 1}.</span>
                  <textarea value={step.text} onChange={(e) => updateStep(sIdx, stIdx, e.target.value)} rows={2} disabled={saving} className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-stone rounded text-ink-primary focus:outline-none focus:border-ink-secondary transition-colors resize-y" />
                  <button type="button" onClick={() => removeStep(sIdx, stIdx)} disabled={saving} className={`${rmCls} mt-1.5`}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => addStep(sIdx)} disabled={saving} className="self-start text-xs text-forest hover:text-forest-deep transition-colors mt-1 disabled:opacity-40">
                + Schritt hinzufügen
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add section */}
      <button
        type="button"
        onClick={addSection}
        disabled={saving}
        className="self-start text-xs text-forest hover:text-forest-deep transition-colors disabled:opacity-40 border border-dashed border-forest/40 rounded px-3 py-1.5"
      >
        + Abschnitt hinzufügen
      </button>

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
