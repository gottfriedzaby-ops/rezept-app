# Google OAuth — Go-Live-Anforderungen

> **Status:** Feature deferred. Die UI (Google-Button auf `/login` und `/register`) wurde entfernt, weil die operative Vorarbeit (Google Cloud Console, Supabase-Dashboard, Produktions-Domain) noch nicht abgeschlossen ist. Diese Spec dokumentiert, was beim Wieder-Aktivieren zu tun ist.

## Kontext

CLAUDE.md hatte Google OAuth ursprünglich als „implementiert" gelistet. Code-seitig war das korrekt — Buttons, `signInWithOAuth({ provider: "google" })`, Callback-Route und Session-Management waren vollständig und testbar. **Go-Live blockiert auf Dashboard-Konfiguration und Verifizierungsprozessen außerhalb des Codes.** Statt halb-funktionale UI auszuliefern, wurde der Button entfernt, bis die Vorbereitungen stehen.

## Bestätigte Entscheidungen

| ID | Entscheidung | Wahl |
|----|-------------|------|
| D-1 | Account-Kollision (gleiche E-Mail bereits via Passwort registriert) | Auto-Link Identities (Supabase „Link Identities Automatically" = ON). Sicher, weil Google nur verifizierte E-Mails zurückgibt. |
| D-2 | Consent-Screen-Status | **Production** — Google-Verifizierung durchlaufen. Kein User-Limit. |
| D-3 | `?redirect=` Deep-Link durch Google-Flow erhalten | **Ja** — Deep-Link wird über `next`-Param durchgereicht. |
| D-4 | Onboarding beim ersten Google-Login | **Nein** — direkter Passthrough auf `/`. |
| D-5 | Produktions-Hostname | Vercel-Default `*.vercel.app` (exakte URL bei Aktivierung einsetzen). |

## Konfigurations-Checkliste (außerhalb des Codes)

### 1. Google Cloud Console

1. Projekt anlegen / vorhandenes wählen.
2. OAuth-Consent-Screen → User Type: **External**
   - App-Name, Support-E-Mail, App-Logo
   - **Authorized Domains:** `supabase.co` + Vercel-Domain
   - **Scopes:** ausschließlich `openid`, `email`, `profile` (keine sensitive scopes → schnelle Verifizierung)
   - **Privacy Policy URL** + **Terms of Service URL** (Pflicht für Production-Status)
3. „Publish App" → Google-Verifizierungsprozess starten
4. Credentials → OAuth 2.0 Client ID → **Web application**:
   - **Authorized JavaScript origins:** Vercel-Prod-URL (`https://<projekt>.vercel.app`) + `http://localhost:3000`
   - **Authorized redirect URIs:** `https://<supabase-project>.supabase.co/auth/v1/callback`
5. Client ID + Client Secret notieren (für Supabase)

### 2. Supabase Dashboard

1. Authentication → Providers → **Google** → enable
2. Client ID + Client Secret aus Schritt 1.5 einfügen
3. Authentication → URL Configuration:
   - **Site URL:** `https://<projekt>.vercel.app`
   - **Additional Redirect URLs:** `http://localhost:3000/**`, `https://<projekt>.vercel.app/**`
4. Authentication → Settings → **Link Identities Automatically: ON** (gemäß D-1)

### 3. Vercel

1. `NEXT_PUBLIC_APP_URL` = `https://<projekt>.vercel.app` als Production-Env-Var setzen (Konsistenz mit `lib/email.ts`)
2. Bestehende `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Production verifizieren

## Code-Änderungen beim Wieder-Aktivieren

Die folgenden Patches sind nötig, sobald die Dashboard-Vorarbeit steht. Git-History (Commit, der diese Spec ergänzt hat) zeigt den exakten Vorzustand und kann als Vorlage genutzt werden.

### `app/login/page.tsx`

1. `GoogleIcon`-Komponente wieder einfügen (4-farbiges Google-Logo, identisch zum vorherigen Stand).
2. `handleGoogleSignIn`-Handler einfügen — **mit Deep-Link-Durchreichung gemäß D-3**:

   ```ts
   async function handleGoogleSignIn() {
     setError(null);
     const origin = window.location.origin;
     const next = redirect && redirect.startsWith("/") ? redirect : "/";
     const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
     const { error: oauthError } = await supabase.auth.signInWithOAuth({
       provider: "google",
       options: { redirectTo: callbackUrl },
     });
     if (oauthError) {
       setError("Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
     }
   }
   ```

3. Im Card-Container vor dem E-Mail-Formular einfügen:

   ```tsx
   <button
     type="button"
     onClick={handleGoogleSignIn}
     className="w-full flex items-center justify-center gap-2.5 rounded border border-stone bg-white px-4 py-2.5 text-sm font-medium text-ink-primary hover:bg-surface-hover transition-colors"
   >
     <GoogleIcon />
     Mit Google anmelden
   </button>

   <div className="my-5 flex items-center gap-3">
     <div className="flex-1 border-t border-stone" />
     <span className="text-xs text-ink-tertiary">oder</span>
     <div className="flex-1 border-t border-stone" />
   </div>
   ```

### `app/register/page.tsx`

Analog. Da Register keinen `redirect`-Param liest, aber `invitationToken`, soll der Token via `next` weitergegeben werden:

```ts
const next = invitationToken
  ? `/auth/callback?invitation=${invitationToken}`
  : "/";
const callbackUrl = `${origin}${invitationToken ? next : `/auth/callback?next=${encodeURIComponent(next)}`}`;
```

(Beim Implementieren konsolidieren — das Snippet ist illustrativ.)

### `app/auth/callback/route.ts` — Open-Redirect-Härtung (Sicherheit)

Aktuelle Zeile 9 (`const next = searchParams.get("next") ?? "/";`) erweitern:

```ts
const rawNext = searchParams.get("next") ?? "/";
const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
```

Verhindert `next=//evil.com` und absolute URLs als Open-Redirect-Vektor.

## Verifikation

**Lokal (`npm run dev`):**
1. `/login` → „Mit Google anmelden" sichtbar → Google-Flow → Redirect auf `/`.
2. Direkt `/rezepte` (geschützt) ohne Session → Redirect auf `/login?redirect=%2Frezepte` → Google-Login → landet auf `/rezepte`. **Hauptcheck für D-3.**
3. Existing E-Mail/Passwort-User mit identischer Google-E-Mail → Login via Google → in Supabase `auth.users` zeigt eine User-Zeile mit zwei Identities (E-Mail + Google). **Hauptcheck für D-1.**
4. Open-Redirect-Härtung: `/auth/callback?next=//evil.com&code=...` → Redirect auf `/`, nicht auf `evil.com`.

**Production (nach Vercel-Deploy):**
5. Erste 3 echte User durchschleusen → Supabase `auth.users` prüfen (Provider, E-Mail verifiziert)
6. Google Cloud Console → Consent-Screen-Status = „In production"

**Automatisierte Checks:**
7. `npx tsc --noEmit` — grün
8. `npm test -- auth-callback` — bestehende Tests grün; idealerweise neuer Test für die Open-Redirect-Härtung ergänzen

## Offene Risiken

- **Google-Verifizierungsdauer:** Für nicht-sensible Scopes (`openid`, `email`, `profile`) meist < 1 Woche. Bei unvollständiger Privacy-/ToS-URL oder fehlendem Logo-Branding kann sich der Prozess verlängern. **Mitigation:** Beide URLs + Logo vor Antragstellung final haben.
- **Auto-Link-Edge-Case:** Ein User mit Passwort-Account kann später per Google einloggen und dabei das Passwort „vergessen". Er kommt via Google weiter rein; „Passwort vergessen" funktioniert weiter via E-Mail. Kein Code-Risiko, nur User-Education.
- **Open-Redirect:** Nur durch die Härtung in der Callback-Route geschlossen — ohne sie wäre `?next=//evil.com` ein Vektor.
- **Preview-Deployments:** Mit Vercel-Wildcard `https://<projekt>-*.vercel.app/**` in Supabase Allowed Redirect URLs lösbar. Ohne diesen Eintrag funktioniert Google-Login nur auf der Prod-Domain.
- **`window.location.origin`:** Der Handler nutzt die Runtime-Origin. Solange die App auf einer einzigen Vercel-Domain läuft, ist das ok; bei mehreren Preview-URLs muss Supabase die entsprechenden Domains erlauben.

## Abhängigkeiten zu anderen Specs

- `docs/requirements/05-auth-and-sharing.md` — definiert das ursprüngliche Auth-Konzept (E-Mail + Google, Apple verworfen).
- `middleware.ts` — schützt alle Nicht-Public-Routen; benötigt keine Anpassung.
- `contexts/AuthContext.tsx` — OAuth-agnostisch über `onAuthStateChange`; benötigt keine Anpassung.

## Wiederaktivierungs-Reihenfolge (empfohlen)

1. Privacy Policy + ToS URLs auf Vercel-Domain bereitstellen
2. Google Cloud Console: OAuth-Client + Consent-Screen → „Publish" beantragen
3. Während der Verifizierung: Supabase-Provider in **Testing** (max. 100 User) live nehmen, intern testen
4. Code-Patches aus der Code-Sektion oben einspielen
5. Nach Google-Verifizierung: Supabase auf Production-Site-URL umstellen
6. Smoke-Tests gemäß Verifikation
