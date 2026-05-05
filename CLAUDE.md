
<style>
  .tabs { display: flex; gap: 8px; margin-bottom: 1.5rem; }
  .tab { padding: 8px 20px; border-radius: var(--border-radius-md); border: 0.5px solid var(--color-border-secondary); cursor: pointer; font-size: 14px; font-weight: 500; background: var(--color-background-secondary); color: var(--color-text-secondary); }
  .tab.active { background: var(--color-background-primary); color: var(--color-text-primary); border-color: var(--color-border-primary); }
  .doc { display: none; }
  .doc.active { display: block; }
  .filename { font-size: 12px; font-family: var(--font-mono); color: var(--color-text-secondary); margin-bottom: 8px; padding: 4px 10px; background: var(--color-background-tertiary); border-radius: var(--border-radius-md); display: inline-block; }
  pre { background: var(--color-background-secondary); border: 0.5px solid var(--color-border-tertiary); border-radius: var(--border-radius-lg); padding: 1.25rem; font-size: 13px; font-family: var(--font-mono); overflow-x: auto; line-height: 1.6; white-space: pre-wrap; margin: 0; }
  .copy-btn { float: right; font-size: 12px; padding: 4px 12px; margin-left: 8px; cursor: pointer; }
</style>

<div class="tabs">
  <div class="tab active" onclick="show('claude')">CLAUDE.md</div>
  <div class="tab" onclick="show('schema')">schema.sql</div>
</div>

<div class="doc active" id="doc-claude">
  <div class="filename">📄 CLAUDE.md &nbsp;→ Repo-Root ablegen</div>
  <button class="copy-btn tab" onclick="copy('claude')">Kopieren</button>
  <pre id="text-claude"># Rezept-App — Projekt-Kontext für Claude Code

## Tech-Stack
- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Datenbank:** Supabase (PostgreSQL)
- **Deployment:** Vercel
- **KI:** Claude API — Modell: `claude-sonnet-4-6` (Rezept-Parsing, Review-Pass, Nährwertschätzung)

## Wichtige Befehle
```bash
npm run dev        # Lokaler Dev-Server (Port 3000)
npm run build      # Produktions-Build
npm run lint       # ESLint
npm test           # Jest-Tests
npx supabase start # Lokale Supabase-Instanz (optional)
```

## Projektstruktur
```
/app
  /api
    /import-url          # Website-Import (Scraping + Claude)
    /import-youtube      # YouTube-Import (Transcript + Claude)
    /import-photo        # Foto-Import (Vision + Claude), Multi-Image
    /import-instagram    # Instagram-Import
    /recipes
      /confirm           # Rezept speichern + Nährwerte berechnen
      /[id]              # GET/PATCH/DELETE einzelnes Rezept
        /nutrition       # POST: Nährwerte neu berechnen
    /shares              # Share-Link erstellen/löschen
    /admin/normalize-tags
    /upload-image
  /(recipes)             # Rezept-Seiten (Liste, Detail, Bearbeiten, Kochmodus)
  /shared/[token]        # Öffentliche Rezeptsammlung (read-only)
  /shopping-list         # Einkaufsliste
  /login                 # Auth-Seiten
  /register
  /settings
  /auth/callback
  /auth/reset-password
/components              # Wiederverwendbare UI-Komponenten
/lib
  supabase.ts            # Supabase Admin-Client
  supabase/
    client.ts            # Browser-Client
    server.ts            # Server-Client (SSR, Cookies)
  claude.ts              # Claude API Wrapper (parse, review, nutrition)
  duplicate-check.ts     # Dreistufige Duplikatprüfung
  import-rate-limit.ts   # Tageslimit 20 Imports/User
  shopping-list.ts       # localStorage-Store für Einkaufsliste
  tags.ts / tag-colors.ts
  amounts.ts
  schemaOrg.ts           # schema.org/Recipe Export
  recipeTypeLabels.ts
/types
  recipe.ts              # Recipe, ParsedRecipe, Ingredient, etc.
/contexts
  AuthContext.tsx
  ImportContext.tsx
/middleware.ts            # Auth-Schutz aller Routen
/__tests__               # Jest-Tests (186 Tests)
/docs
  requirements.md        # Vollständige Anforderungsdokumentation
  requirements/          # Feature-Spezifikationen 01–08
  test-concept.md        # QA-Testkonzept
/supabase/migrations/    # SQL-Migrationen
```

## Datenmodell (Kurzübersicht)
- `recipes` — Haupttabelle:
  - Zutaten (`ingredients` JSONB) und Schritte (`steps` JSONB) **per Portion** gespeichert
  - `sections` JSONB — benannte Abschnitte (z.B. „Für die Soße")
  - `source_type` / `source_value` — Pflichtfelder (url, photo, youtube, instagram, manual)
  - `user_id` — Eigentümer (auth.users)
  - `recipe_type` — kochen / backen / grillen / zubereiten
  - `scalable` — ob Mengen linear skalierbar sind
  - `kcal_per_serving`, `protein_g`, `carbs_g`, `fat_g` — Nährwerte pro Portion (nullable)
  - `favorite`, `image_url`, `step_images`, `tags`
- `shares` — Share-Tokens (owner_id, token, revoked_at)
- `import_jobs` — asynchrone Import-Queue

**Pending Migration:** `supabase/migrations/20260505000000_feature08_nutrition_columns.sql` muss noch im Supabase SQL-Editor ausgeführt werden (fügt Nährwert-Spalten hinzu).

## Code-Konventionen
- TypeScript strict mode — keine `any`-Typen
- Komponenten: funktional, mit expliziten Props-Interfaces
- API-Routes geben immer `{ data, error }` zurück
- Fehlerbehandlung: try/catch in allen API-Calls
- Deutsch für UI-Text, Englisch für Code/Variablen

## Import-Pipeline (vollständiger Ablauf)
1. Rohdaten holen (Scraping / OCR / YouTube Transcript / Instagram)
2. **Parse-Pass:** Rohdaten → Claude → strukturiertes `ParsedRecipe` JSON
3. **Review-Pass:** Claude prüft Vollständigkeit, Mengen, Reihenfolge, übersetzt auf Deutsch
4. Duplikatprüfung (exact URL → normalisierte URL → Jaccard-Ähnlichkeit ≥ 0.85)
5. User-Review-Formular (Zutaten, Schritte bearbeitbar)
6. Speichern via `/api/recipes/confirm` + Nährwerte schätzen (Claude, best-effort)
7. Quelle immer als Pflichtfeld; `source_value = "manual"` für manuelle Eingaben

## Import-Tageslimit
- 20 Imports pro User pro Kalendertag (UTC)
- Geprüft in allen 4 Import-Routen + confirm-Route
- Antwort: HTTP 429 mit deutschem Fehlertext

## Claude API — verwendete Funktionen in `lib/claude.ts`
- `parseRecipeFromText` — Text/URL → ParsedRecipe
- `parseRecipeFromImage` / `parseRecipeFromImages` — Foto(s) → ParsedRecipe
- `reviewAndImproveRecipe` — Qualitätsprüfung + Übersetzung ins Deutsche
- `estimateNutrition` — Nährwertschätzung aus Zutaten (per-Portion-Mengen → per-Portion-Nährwerte)

Ingredient-Mengen werden **immer per Portion** gespeichert (Division durch servings im Parser).

## Umgebungsvariablen (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
YOUTUBE_API_KEY=
```

## Implementierte Features
- ✅ Rezept-Import: URL, YouTube, Foto (inkl. Multi-Image), Instagram, manuell
- ✅ Rezept-Typ-Unterscheidung (kochen / backen / grillen / zubereiten)
- ✅ Multi-Abschnitt-Rezepte (benannte Sections mit eigenen Zutaten/Schritten)
- ✅ PDF-Export
- ✅ Authentifizierung (E-Mail + Google OAuth, Registrierung, Passwort-Reset, Middleware)
- ✅ Sharing (tokenbasierte read-only Links, widerrufbar, kein Ablaufdatum)
- ✅ Cookidoo-Export (schema.org JSON-LD Download + Plaintext-Kopie)
- ✅ Einkaufsliste (localStorage, Portionsskalierung, manuelle Eingabe)
- ✅ Nährwertberechnung (Claude-Schätzung, per Portion, Neu-berechnen-Button)
- ✅ Dreistufige Duplikatprüfung
- ✅ Tag-Normalisierung (Synonym-Map → lowercase Deutsch)
- ✅ Kochmodus (step-by-step, Timer, Wake-Lock)
- ✅ Import-Tageslimit (20/Tag/User, UTC-Reset)

## Was noch NICHT implementiert ist
- Mehrsprachigkeit
- Meal Planning

## Datenmigrations-Entscheidungen
- Beim Rollout von Multi-User werden alle vor der Auth-Einführung importierten Rezepte gelöscht. Jeder Nutzer startet mit einer leeren Datenbank.</pre>
</div>

<div class="doc" id="doc-schema">
  <div class="filename">📄 supabase/schema.sql &nbsp;→ in Supabase SQL-Editor ausführen</div>
  <button class="copy-btn tab" onclick="copy('schema')">Kopieren</button>
  <pre id="text-schema">-- Rezept-App Datenbankschema
-- In Supabase: SQL Editor → New query → einfügen → Run

-- Rezepte (Haupttabelle)
create table recipes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),

  title        text not null,
  description  text,
  servings     integer,
  prep_time    integer,  -- Minuten
  cook_time    integer,  -- Minuten

  -- Strukturierte Daten als JSON
  ingredients  jsonb not null default '[]',
  -- [{ "amount": 200, "unit": "g", "name": "Mehl" }]

  steps        jsonb not null default '[]',
  -- [{ "order": 1, "text": "...", "timerSeconds": 300 }]

  tags         text[] default '{}',

  -- Quelle (Pflichtfeld)
  source_type  text not null check (source_type in ('url','photo','youtube','manual')),
  source_value text not null,  -- URL, Foto-Pfad oder YouTube-ID
  source_title text,           -- Seitentitel / Kanal-Name

  -- Foto des fertigen Gerichts (optional)
  image_url    text,

  -- Für Volltextsuche
  search_vector tsvector
    generated always as (
      to_tsvector('german', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || array_to_string(tags,' '))
    ) stored
);

-- Volltextsuche Index
create index recipes_search_idx on recipes using gin(search_vector);
create index recipes_tags_idx on recipes using gin(tags);
create index recipes_source_type_idx on recipes (source_type);
create index recipes_created_at_idx on recipes (created_at desc);

-- Updated-at automatisch setzen
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger recipes_updated_at
  before update on recipes
  for each row execute function set_updated_at();

-- Import-Queue (für asynchrone Verarbeitung)
create table import_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  status      text default 'pending' check (status in ('pending','processing','done','error')),
  source_type text not null,
  source_value text not null,
  error_msg   text,
  recipe_id   uuid references recipes(id)
);

-- Beispiel-Rezept (zum Testen)
insert into recipes (title, servings, prep_time, cook_time, ingredients, steps, tags, source_type, source_value, source_title)
values (
  'Klassische Tomatensoße',
  4, 10, 30,
  '[{"amount":800,"unit":"g","name":"Tomaten (Dose)"},{"amount":1,"unit":"","name":"Zwiebel"},{"amount":3,"unit":"","name":"Knoblauchzehen"},{"amount":2,"unit":"EL","name":"Olivenöl"},{"amount":1,"unit":"TL","name":"Salz"}]',
  '[{"order":1,"text":"Zwiebel und Knoblauch fein hacken.","timerSeconds":null},{"order":2,"text":"Olivenöl erhitzen, Zwiebel 3 Min. andünsten.","timerSeconds":180},{"order":3,"text":"Knoblauch kurz mitbraten, Tomaten dazugeben.","timerSeconds":60},{"order":4,"text":"30 Min. bei niedriger Hitze köcheln lassen.","timerSeconds":1800}]',
  ARRAY['pasta','vegetarisch','grundrezept'],
  'manual', 'manual', 'Eigenes Rezept'
);</pre>
</div>

<script>
function show(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.doc').forEach(d => d.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('doc-' + tab).classList.add('active');
}
function copy(id) {
  const text = document.getElementById('text-' + id).innerText;
  navigator.clipboard.writeText(text);
  event.target.textContent = 'Kopiert ✓';
  setTimeout(() => event.target.textContent = 'Kopieren', 2000);
}
</script>
