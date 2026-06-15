# Rezept-App — Projekt-Kontext für Claude Code

## Tech-Stack
- **Framework:** Next.js 14 (App Router, TypeScript strict)
- **Styling:** Tailwind CSS (Custom Design System: `surface`/`ink`/`forest`-Palette, Fonts Inter + Fraunces)
- **i18n:** next-intl — Locales `de` (Default), `en`, `nl`; alle Seiten unter `app/[locale]/`
- **Datenbank:** Supabase (PostgreSQL, RLS auf allen User-Tabellen)
- **PWA:** Serwist Service Worker (`app/sw.ts`), Offline-Fallback `/offline`, Web-Push-Code vorhanden
- **Deployment:** Vercel
- **KI:** Claude API — `claude-sonnet-4-6` (Rezept-Parsing, Review-Pass), `claude-haiku-4-5` (Nährwerte, Zutaten-Kategorisierung)

## Wichtige Befehle
```bash
npm run dev          # Dev-Server (Port 3000)
npm run build        # Produktions-Build (läuft ohne env vars — lazy Supabase-Clients)
npm run lint         # ESLint (no-explicit-any = error)
npm test             # Jest (2 Projekte: node für lib/api, jsdom für Komponenten)
npm run test:e2e     # Playwright (hermetisch, Supabase gemockt)
```

## Projektstruktur (real)
```
/app
  /[locale]                  # next-intl Routing (de/en/nl)
    /(recipes)               # Rezeptliste, [id] Detail, [id]/edit, [id]/cook
    /meal-plan               # Wochenplan (Feature 16, + KI-Wochenvorschlag)
    /nutrition               # Ernährungstagebuch + Kalorien-/Makro-Ziele (Feature 19)
    /fasting                 # Intervallfasten-Tracker (Live-Timer, Feature 19 Phase 3)
    /assistant               # KI-Kochassistent („Was kann ich kochen?“)
    /collections             # Sammlungen (+ /[id] Detail)
    /shopping-list           # Einkaufsliste (+ /shop In-Store-Modus)
    /library-shares          # Geteilte Bibliotheken (incoming, [ownerId], [ownerId]/[recipeId])
    /shared/[token]          # Öffentliche read-only Rezeptsammlung
    /login /register /settings /auth/reset-password
    /settings/admin          # Admin-Dashboard (Users, Metriken, Invite-Allowlist)
  /api
    /import-url /import-youtube /import-photo /import-instagram
    /import-pdf              # + /preview, /pick (Multi-Rezept-PDFs, Passwort-Support)
    /recipes/confirm         # Speichern + Nährwertschätzung (best-effort)
    /recipes/[id]            # GET/PATCH/DELETE, + /duplicate, + /nutrition (POST, auth-pflichtig)
    /meal-plan               # GET ?week= / POST, + /[id] PATCH/DELETE
    /nutrition               # /profile GET/PUT (Ziele), /log GET ?date=/POST, /log/[id] PATCH/DELETE, /estimate-photo (Vision, 15/Tag)
    /nutrition/fasting       # GET/POST (start, 1 offener Fast/User), /[id] PATCH (stop)/DELETE
    /assistant               # suggest, week-plan, cooking-question (Limit 30/Tag)
    /collections             # CRUD + /[id]/recipes Mitgliedschaft
    /shares /library-shares  # Token-Links bzw. Account-Sharing (invitation, reshare, …)
    /shopping/categorize     # Zutaten-Kategorisierung (Haiku)
    /settings /upload-image /push/subscribe /auth/preflight-register
    /admin                   # users, metrics, invited-emails — nur via Middleware-Gate
  /auth/callback             # Supabase Code-Exchange (locale-frei)
  /offline                   # PWA-Fallback (+ /offline/recipe aus IndexedDB-Cache)
/components                  # UI-Komponenten (RecipeList, CookMode, ShoppingMode, Import*, MealPlan*, admin/*)
/contexts                    # AuthContext, ImportContext, ToastContext
/lib
  claude.ts                  # Claude-Wrapper (claudeCreate) + Parse/Review/Nutrition/Categorize
  assistant.ts               # KI-Assistent (Pantry-Vorschläge, Wochenplan, Koch-Fragen)
  assistant-rate-limit.ts    # 30 Assistent-Calls/User/Tag (über claude_api_calls)
  supabase.ts                # Lazy-Proxy Admin-Client (Service-Role); supabase/server.ts + client.ts (SSR/Browser)
  profiles.ts                # Batch-User-Lookups über profiles-Tabelle (42P01-Fallback auf auth.admin)
  duplicate-check.ts         # 3-stufige Duplikatprüfung (user-scoped, parallel gefetcht)
  recipe-search.ts           # Server-seitige Suche/Pagination (+ Tag-Facette, Shared-Sichtbarkeit)
  import-rate-limit.ts       # 20 Imports/User/Tag (UTC)
  shopping-list.ts           # localStorage-Store der Einkaufsliste (Tombstones für Sync)
  shopping-list-sync.ts      # Cloud-Sync: debounced Push, Pull-Merge, useShoppingListSync
  meal-plan.ts               # Wochen-Mathematik (getWeekStart, addDays, …)
  nutrition-goals.ts         # Pure BMR/TDEE/Makro-Mathematik (Mifflin-St Jeor), Feature 19
  fasting.ts                 # Pure Fasten-Mathematik (Fortschritt/Presets/Formatierung), Feature 19 Phase 3
  image-validation.ts        # Magic-Byte-Sniffing für Uploads
  amounts.ts / tags.ts / tag-colors.ts / schemaOrg.ts / pdf-import.ts / parsers/
/types                       # recipe.ts, meal-plan.ts, …
/messages                    # de.json, en.json, nl.json (next-intl)
/middleware.ts               # Auth-Gate (Pages-Redirect, /api/admin 403); andere /api-Routen prüfen selbst!
/__tests__                   # Jest: api/, components/, lib/ — Mock-Patterns siehe docs/test-concept.md §15
/tests/e2e                   # Playwright
/docs                        # requirements/ (Specs 01–16), audit-2026-06.md, roadmap.md, test-concept.md
/supabase/migrations         # SQL-Migrationen (idempotent, IF NOT EXISTS + RLS in derselben Datei)
```

## Datenmodell (Kurzübersicht)
- `recipes` — Zutaten (`ingredients` JSONB) und Schritte (`steps` JSONB) **per Portion**;
  `sections` JSONB (benannte Abschnitte); `source_type`/`source_value` Pflicht
  (url/photo/youtube/instagram/pdf/manual); `user_id`; `recipe_type`
  (kochen/backen/grillen/zubereiten/cocktail); Nährwerte pro Portion (nullable);
  `favorite`, `image_url`, `step_images`, `tags`, `is_private`, `search_vector` (tsvector, noch ungenutzt)
- `profiles` — Spiegel von `auth.users` (id, email, display_name), Trigger-synced; für Batch-Lookups statt `auth.admin`
- `meal_plan_entries` — Wochenplan: user_id, recipe_id, date, meal_slot (fruehstueck/mittag/abend), servings-Override
- `nutrition_profiles` — Körperdaten + Tagesziele (sex, birth_date, height_cm, weight_kg, activity_level, goal, target_*; `manual_targets`) — 1 Zeile/User (Feature 19)
- `food_log_entries` — Ernährungstagebuch: user_id, date, meal_slot (+`snacks`), source (recipe/manual/photo), label, servings + Nährwert-Snapshot pro Portion; `recipe_id` nullable (ON DELETE SET NULL) (Feature 19)
- `fasting_sessions` — Intervallfasten: user_id, started_at, ended_at (nullable), target_hours, preset (16:8/18:6/20:4/omad/custom); partieller Unique-Index `WHERE ended_at IS NULL` = max. 1 offener Fast/User (Feature 19 Phase 3)
- `collections` (+ `collection_recipes`) — Rezept-Sammlungen pro User (UNIQUE name)
- `recipes` zusätzlich: `rating` (1–5), `notes`, `cooked_count`, `last_cooked_at` (Feature 17)
- `library_shares` (+ `library_share_reshare_requests`) — Account-zu-Account-Sharing
- `shares` — öffentliche Token-Links (read-only, widerrufbar)
- `user_settings`, `push_subscriptions`, `pdf_import_sessions`, `invited_emails`, `claude_api_calls`

## Code-Konventionen
- TypeScript strict, **keine `any`** (ESLint erzwingt es)
- Komponenten: funktional, explizite Props-Interfaces
- API-Routes: immer `{ data, error }`; Fehlertexte auf Deutsch
- **Auth-Pattern in API-Routes:** `createSupabaseServerClient()` → `getUser()` → 401 wenn null;
  Daten via `supabaseAdmin` (Service-Role, umgeht RLS) — Ownership **explizit prüfen**.
  Die Middleware schützt nur Pages und `/api/admin/*`!
- UI-Text via next-intl (`useTranslations`/`getTranslations`), neue Keys in **alle drei** `messages/*.json`
- Zutaten-Mengen **immer per Portion** speichern (Division durch servings beim Import)
- Loading-/Error-/Empty-States sind Pflicht (siehe Skills `rezept-conventions`, `frontend-ux`)
- Migrationen: idempotent, RLS-Policies in derselben Datei, Namensschema `YYYYMMDD000000_name.sql`

## Import-Pipeline
1. Rohdaten holen (Scraping / Vision / YouTube-Transcript / Instagram / PDF via mupdf)
2. **Parse-Pass** (Sonnet) → `ParsedRecipe`; **Review-Pass** (Sonnet) prüft + übersetzt — überspringbar bei starkem JSON-LD (`canSkipReviewPass`)
3. Duplikatprüfung (exact URL → normalisierte URL → Jaccard ≥ 0.85), user-scoped
4. User-Review-Formular → `/api/recipes/confirm` → Nährwerte (Haiku, best-effort)
5. Imports laufen **synchron** (keine Job-Queue); Tageslimit 20/User (HTTP 429, deutscher Text)

## Umgebungsvariablen
Siehe `.env.local.example` (vollständig kommentiert): Supabase-Keys, `ANTHROPIC_API_KEY`,
`YOUTUBE_API_KEY`, `JINA_READER_API_KEY` (optional), Resend + `EMAIL_FROM_ADDRESS`,
`NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`, `INVITE_ONLY_REGISTRATION`, VAPID-Keys (Push).

## Implementierte Features
- ✅ Import: URL, YouTube, Foto (Multi-Image, HEIC), Instagram, PDF (Passwort, Multi-Rezept-Picker), manuell
- ✅ Rezept-Typen (5), Multi-Abschnitt-Rezepte, Tag-Normalisierung, Kategorie-Illustrationen
- ✅ Auth (E-Mail, Invite-Gate, Passwort-Reset), Middleware-Schutz
- ✅ Sharing: Token-Links **und** Bibliothek-Sharing (Einladung per E-Mail, Reshare-Workflow)
- ✅ Einkaufsliste (localStorage, Skalierung, In-Store-Modus, Kategorisierung) + Kochmodus (Timer, Wake-Lock, Tastatur)
- ✅ Wochenplan (Feature 16): Woche × Mahlzeit-Slots, Portions-Override, „Woche zur Einkaufsliste"
- ✅ Ernährungstagebuch + Ziele (Feature 19, Yazio-Kern): Körperprofil → Tagesbudget (BMR/TDEE,
  `lib/nutrition-goals.ts`), Tagebuch pro Mahlzeit (Rezept-Snapshot, manuell oder Foto-Schätzung
  via Claude Vision, 15/Tag), Kalorienring + Makro-Balken; Intervallfasten-Tracker (Phase 3,
  `/fasting`: Live-Timer-Ring, Presets 16:8/18:6/20:4/OMAD, Verlauf)
- ✅ Nährwertschätzung, PDF-/Cookidoo-Export
- ✅ Server-seitige Suche + Pagination (`lib/recipe-search.ts`, Trigram-Index auf `search_text`;
  Hauptseite SSRt die erste Seite, „Mehr laden" via `/api/recipes/search`)
- ✅ Einkaufslisten-Cloud-Sync (offline-first, LWW, Tombstones — `lib/shopping-list-sync.ts`)
- ✅ Dark Mode (class-Strategie über CSS-Variablen, Toggle in Settings)
- ✅ Sentry (opt-in via `NEXT_PUBLIC_SENTRY_DSN`, sonst No-op)
- ✅ i18n (de/en/nl, inkl. Admin- und Sharing-UI), PWA (offline, installierbar), Admin-Dashboard, Import-Tageslimit
- ✅ Toasts, Loading-Skeletons, globale Fokus-Indikatoren

## Noch NICHT implementiert (siehe docs/roadmap.md)
- Google OAuth-, Push-, Store-Go-Lives; Prompt-Caching (Phase 4)

## Betriebshinweise
- Sieben Migrationen vom Juni 2026 (`profiles`, `meal_plan_entries`, `recipe_search`,
  `shopping_list_sync`, `feature17_discovery`, `feature19_nutrition_tracking`,
  `feature19_fasting`) müssen vom Operator im Supabase SQL-Editor ausgeführt werden —
  Code degradiert bis dahin graceful (Checkliste in docs/roadmap.md).
- Sentry ist ohne `NEXT_PUBLIC_SENTRY_DSN` ein No-op; DSN + Auth-Token in Vercel setzen.
- Beim Multi-User-Rollout wurden alle Alt-Rezepte gelöscht; jeder Nutzer startet leer.
