# App-Store-Paketierung — Go-Live-Setup

Die App ist eine installierbare PWA (Manifest, Icons, Service Worker, HTTPS). Um sie
zusätzlich über die **Stores** auszuliefern, wird die PWA verpackt — es ist **kein**
separater Produkt-Code nötig. Der größte Teil passiert **außerhalb dieses Repos** mit
externen Tools, Store-Accounts und Signaturschlüsseln.

## Was bereits im Repo vorbereitet ist

- Vollständiges Web-App-Manifest (`app/manifest.ts`) inkl. `id`, `categories`,
  `shortcuts`, 192/512/maskable Icons, `display: standalone`, `theme_color`.
- `/.well-known/assetlinks.json` (Platzhalter — siehe Android-Schritt 4) wird ohne
  Auth/Locale-Redirect ausgeliefert (Middleware-Matcher schließt `.well-known` aus).

## Voraussetzungen, die DU bereitstellen musst

| Sache | Wofür |
| --- | --- |
| Produktions-Domain (z. B. `https://rezept-app.vercel.app` oder Custom-Domain) | TWA-Quelle + Asset-Links |
| Android-Paketname (z. B. `de.workingtalent.rezept`) | Play Store + assetlinks.json |
| Google-Play-Entwicklerkonto (einmalig 25 $) | Play-Store-Upload |
| Apple-Developer-Account (99 $/Jahr) + Mac mit Xcode | App-Store-Upload |

---

## Android — Play Store (TWA via Bubblewrap)

Eine **Trusted Web Activity** zeigt die PWA ohne Browser-Leiste, wenn die Domain per
Digital Asset Links verifiziert ist.

1. **Bubblewrap installieren & initialisieren** (Node ≥ 18, JDK + Android SDK werden
   von Bubblewrap eingerichtet):
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://<PROD-DOMAIN>/manifest.webmanifest
   ```
   Paketnamen + App-Namen abfragen lassen. Erzeugt ein `twa-manifest.json` + ein
   Android-Projekt (NICHT in dieses Repo committen — eigenes Verzeichnis/Repo).
2. **Bauen** (erzeugt beim ersten Mal einen Signaturschlüssel):
   ```bash
   bubblewrap build
   ```
   → `app-release-bundle.aab` (Upload-Artefakt) + ein Signing-Keystore.
3. **SHA-256-Fingerprint** des Signaturschlüssels holen:
   ```bash
   keytool -list -v -keystore android.keystore -alias android
   ```
   (Bubblewrap zeigt ihn auch nach dem Build an. **Play App Signing** verwendet außerdem
   einen eigenen Schlüssel — dessen Fingerprint findest du in der Play Console unter
   *Setup → App-Integrität*; beide Fingerprints können in assetlinks.json.)
4. **`public/.well-known/assetlinks.json` ausfüllen** (in DIESEM Repo) — `package_name`
   und `sha256_cert_fingerprints` ersetzen, committen, **deployen**. Prüfen:
   `https://<PROD-DOMAIN>/.well-known/assetlinks.json` muss das JSON liefern (HTTP 200).
5. **AAB in der Play Console hochladen**, Store-Eintrag ausfüllen, veröffentlichen.

> Alternative ohne lokales Toolchain-Setup: **PWABuilder** (https://www.pwabuilder.com)
> — Domain eingeben, Android-Paket generieren lassen, der Fingerprint/assetlinks-Flow
> ist identisch.

---

## iOS — App Store (Capacitor)

Apple akzeptiert keine reine PWA; sie wird in eine **Capacitor**-WebView verpackt.

1. **Capacitor hinzufügen** (das Native-Projekt NICHT committen — lokal/separat):
   ```bash
   npm i @capacitor/core @capacitor/cli @capacitor/ios
   npx cap init "Rezept-App" de.workingtalent.rezept
   npx cap add ios
   ```
2. In `capacitor.config.ts` die **gehostete App laden** (einfachster Weg, immer aktuell):
   ```ts
   import type { CapacitorConfig } from "@capacitor/cli";
   const config: CapacitorConfig = {
     appId: "de.workingtalent.rezept",
     appName: "Rezept-App",
     server: { url: "https://<PROD-DOMAIN>", cleartext: false },
   };
   export default config;
   ```
   (Alternativ die statischen Assets bündeln — komplexer, da die App SSR nutzt; das
   `server.url`-Vorgehen ist hier pragmatischer.)
3. `npx cap open ios` → in **Xcode** signieren (Apple-Team), Bundle-ID setzen, Icons/
   Launch-Screen, dann Archive → App Store Connect hochladen.
4. **Push auf iOS:** funktioniert in der installierten App ab iOS 16.4. In Xcode die
   *Push Notifications*-Capability aktivieren; die bestehende Web-Push-Logik greift in
   der WebView.

> Hinweis zu iOS-Limits: WebView-Wrapper unterliegen Apples Review (genug nativer
> Mehrwert/Funktionalität nötig). Storage kann strenger limitiert sein als im Browser.

---

## Nach der Veröffentlichung (optional)

Sobald die Apps live sind, ins Manifest aufnehmen, damit Browser die Store-App
bevorzugt anbieten:
```ts
related_applications: [
  { platform: "play",   id: "de.workingtalent.rezept" },
  { platform: "itunes", url: "https://apps.apple.com/app/idXXXXXXXXX" },
],
prefer_related_applications: false, // true ⇒ Browser bewirbt die Store-App statt PWA-Install
```

## Was dieses Repo NICHT enthält (bewusst)

- Generierte Native-Projekte (Bubblewrap-Android, Capacitor-iOS) — lokal/extern erzeugen.
- Signaturschlüssel / Keystores / Provisioning Profiles — Geheimnisse, niemals committen.
- Store-Builds & Einreichungen — manuell mit den jeweiligen Accounts.
