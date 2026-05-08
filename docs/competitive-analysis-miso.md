# Competitive Analysis: Miso – Recipe Keeper

**Status:** Draft
**Author:** Product Owner / Requirements Engineer
**Date:** 2026-05-08
**Analysiertes Produkt:** Miso – Recipe Keeper (iOS), `id6756516262`, Cranberry Apps GmbH, Berlin
**Vergleichsprodukt:** Rezept-App (Next.js 14 / Supabase / Claude API)

---

## Quellenlage und methodische Hinweise

- **Primärquelle:** Apple App Store DE-Seite des Apps (https://apps.apple.com/de/app/miso-recipe-keeper/id6756516262). Die US-Store-Seite gibt 404 zurück — das App ist offenbar nur in DE/EU gelistet bzw. erst kürzlich gelauncht.
- **Sekundärquellen:** Cranberry Apps Website (cranberry.app, sehr dünner Inhalt, kein App-spezifisches Marketing), allgemeine Web- und Reddit-Suchen.
- **Wichtige Einschränkung:** Es existiert ein **zweites, unabhängiges App** namens "Miso Cook: Meal Planner" (id6757978247, Entwickler Vadym Maistruk aus Vinnytsia/Ukraine). Dieses App ist **nicht** Gegenstand dieser Analyse, hat aber denselben Namen und ein sehr ähnliches Konzept. Wo Quellen wie misocook.com auftauchen, gehören sie **nicht** zu Cranberrys Miso. In dieser Analyse wird strikt nur das Cranberry-App betrachtet.
- **Reviews:** Nur 4 Rezensionen sind auf der DE-Store-Seite öffentlich sichtbar, alle positiv. 257 Ratings insgesamt bei 4,3 Sternen — d.h. die qualitative Stichprobe ist klein. Reddit-/Blog-Diskussionen zu Cranberrys Miso sind praktisch nicht auffindbar (App ist sehr neu, Release März 2024, derzeit Version 1.5).
- **Konsequenz:** Aussagen zu negativem Feedback sind dünn belegt und werden als solche markiert.

---

## A. Miso at a glance

Miso – Recipe Keeper ist ein im März 2024 (v1.0) gelaunchtes iOS-App von **Cranberry Apps GmbH** (Berlin), das im Kern das gleiche Problem adressiert wie unsere Rezept-App: das chaotische Speichern von Rezepten über Instagram, TikTok, Facebook, YouTube und Web-Blogs an einem Ort. Positionierung laut Store-Beschreibung: *"Klick auf Teilen, fertig"* — also ein iOS-natives Share-Sheet-First-Erlebnis, das Rezepte (inkl. Videos, PDFs, Screenshots) automatisch in ein lesbares Format mit Zutaten und Schritten konvertiert. Zielgruppe sind primär **Social-Media-affine Hobbyköche**, die Rezepte aus Reels/TikToks sammeln, sowie **Haushalte**, die ihre Wochenplanung und Einkäufe digital koordinieren wollen. Das App ist kostenlos mit umfangreicher IAP-Struktur (Miso Plus, gestaffelte Preise von 6,99 € bis 49,99 €) und erreicht im DE-Store eine solide Bewertung von **4,3 Sternen bei 257 Ratings**. Mit iOS 17+ als Mindestanforderung und Premium-Anmutung ("minimalistisches, ästhetisches Design") positioniert sich Miso klar im Premium-Lifestyle-Segment, nicht als reines Utility-Tool.

---

## B. Feature inventory

| Feature | Miso | Rezept-App | Status |
|---|---|---|---|
| Import aus URL/Web-Blogs | Ja | Ja (`/api/import-url`) | ✅ Wir haben es |
| Import aus YouTube | Ja (Videos) | Ja (`/api/import-youtube`, Transcript) | ✅ Wir haben es |
| Import aus Instagram | Ja (zentral beworben) | Ja (`/api/import-instagram`) | ✅ Wir haben es |
| Import aus **TikTok** | Ja (zentral beworben) | **Nein** | ❌ Wir lacken es |
| Import aus **Facebook** | Ja (in Beschreibung erwähnt) | Nein | ❌ Wir lacken es |
| Import aus Foto / Screenshot | Ja (auch Screenshots) | Ja (`/api/import-photo`, Multi-Image) | ✅ Wir haben es |
| Import aus **PDF** | Ja (explizit beworben) | **Nein** | ❌ Wir lacken es |
| Import aus Video (Parsing) | Ja (Captions, on-screen Text laut Beschreibung) | Teilweise (YouTube Transcript), kein Reel/TikTok | 🔄 Andere Tiefe |
| Manueller Eingabe | Ja (impliziert) | Ja (`source_type='manual'`) | ✅ Wir haben es |
| iOS Share-Sheet-Integration | Ja, **Kernfeature** ("Klick auf Teilen, fertig") | **Nein** (Web-App, kein natives iOS-Share) | ❌ Strukturelle Lücke |
| Native iOS-/iPad-App | Ja (iOS 17+) | Nein (Next.js Web, mobile responsive) | 🔄 Andere Plattform |
| **Offline-Funktionalität** | Ja, "komplett offline" | Nein (online-only Web-App) | ❌ Wir lacken es |
| Rezept-Editing nach Import | Ja | Ja (Review-Formular vor Save) | ✅ Wir haben es |
| Portion-Skalierung | Ja | Ja (per Portion gespeichert) | ✅ Wir haben es |
| Persönliche Fotos hinzufügen | Ja | Ja (`image_url`, `step_images`) | ✅ Wir haben es |
| **Kategorien / Sammlungen** | Ja (custom Collections) | Teilweise (Tags, keine Collections) | 🔄 Wir haben Tags statt Sammlungen |
| **UI-Anpassung (Farben, Icons)** | Ja (custom Farben/Icons) | Nein | ❌ Wir lacken es |
| Tags / Tag-Normalisierung | nicht explizit beworben | Ja (Synonym-Map, lowercase DE) | ✅ Wir haben es (vermutlich differenzierend) |
| **Diätfilter (vegan/vegetarisch/pescatarisch)** | Ja, explizit | Nein (nur freie Tags) | ❌ Wir lacken es als strukturierte Filter |
| **Meal Planning / Wochenplaner** | Ja, "Digitaler Essensplaner" | **Nein** (offene Lücke) | ❌ Wir lacken es |
| Einkaufsliste | nicht explizit beworben (für Cranberry-Miso); Konzept passt aber zum Meal Planner | Ja (localStorage, Portionsskalierung) | 🔄 Wir haben es eigenständig |
| Nährwerte (kcal/Makros) | Ja, "Nährwertangaben" | Ja (Claude-Schätzung, per Portion) | ✅ Wir haben es |
| **Kosten pro Portion** | Ja, explizit beworben | **Nein** | ❌ Wir lacken es |
| Original-Quelle anzeigen | Ja, "Originalquelle" | Ja (`source_type` + `source_value` Pflicht) | ✅ Wir haben es |
| Original-Video-Link erhalten | Ja, beworben | Teilweise (URL-Quelle gespeichert, aber kein eingebetteter Videoplayer) | 🔄 Andere Tiefe |
| **Dark Mode** | Ja, beworben | Unklar (Tailwind-Default; nicht explizit als Feature) | 🔄 Klärungsbedarf |
| Kochmodus (Step-by-Step) | nicht explizit beworben | Ja (Timer, Wake-Lock) | ✅ Differenzierend (vermutlich) |
| Sektion-Rezepte (mehrere Bereiche) | nicht beworben | Ja (`sections` JSONB) | ✅ Differenzierend |
| Rezept-Typ (kochen/backen/grillen/zubereiten) | Nein erkennbar | Ja | ✅ Differenzierend |
| PDF-Export | Nein erkennbar | Ja | ✅ Differenzierend |
| Cookidoo / schema.org Export | Nein | Ja | ✅ Differenzierend |
| Sharing (Read-only Token-Links) | Nein erkennbar | Ja (revocable) | ✅ Differenzierend |
| Duplikatprüfung (3-stufig) | Nein erkennbar | Ja | ✅ Differenzierend |
| Authentifizierung | Vermutlich Apple ID / iCloud-Sync (nicht explizit) | Ja (E-Mail + Google OAuth) | 🔄 Andere Implementierung |
| Mehrsprachigkeit | Ja (DE + EN) | **Nein** | ❌ Wir lacken es |
| Familien-/Haushaltssync | nicht für Cranberry-Miso belegt (Achtung: anderes "Miso Cook" hat es) | Nein | ❓ Unklar |
| Tageslimit Imports | nicht erkennbar | Ja (20/Tag/User) | 🔄 Andere Strategie (wir limitieren wegen Claude-Kosten) |

> **Belegquelle für die "Miso"-Spalte:** App-Store-Beschreibung DE (Stand 2026-05-08). Alle Punkte mit "nicht explizit beworben" oder "nicht erkennbar" sind Hinweise darauf, dass das Feature im Marketing nicht prominent ist — nicht zwingend, dass es fehlt.

---

## C. What users love (review highlights)

Basis: 4 öffentlich sichtbare Reviews auf der DE-Store-Seite (alle positiv) + Gesamtbewertung 4,3/5 bei 257 Ratings. Wiederkehrende Themen:

- **Löst ein konkretes Pain-Point: vergessene Insta-Rezepte.** Max Fröhlich: *"Die App löst ein Problem, das ich schon Ewigkeiten habe 🙌 Man speichert Rezepte bei Insta und danach sind sie vergessen 😅 jetzt nicht mehr 😍"* — der Marketing-Kern (*"speichern → vergessen → nie kochen"*) trifft offenbar den Nerv der Zielgruppe.
- **Niedrige Eingabehürde / Share-Sheet-Flow.** Izzy2796: *"Das hinzufügen von Rezepten geht super easy."* JoMa-2022: *"gut durchdachte und funktionierende Lösung"*. Das *Klick-auf-Teilen-fertig*-Flow ist das mit Abstand am häufigsten gelobte Element.
- **Ästhetik / Premium-Look.** Izzy2796: *"Sehr begeistert bin ich von dem minimalistischen, ästhetischen Design der App. ❤️"* — das visuelle Design wird als Differenzierungsmerkmal wahrgenommen.
- **Discovery via Social Media funktioniert.** Robin9731: *"Hab die app auf Instagram gesehen und dachte mir das kann nützlich sein..."* — weist auf erfolgreiche Marketing-Plattform-Anpassung hin.

---

## D. What users complain about (review pain points)

> **Wichtiger Disclaimer:** Auf der DE-Seite sind **keine negativen Reviews öffentlich sichtbar**. 4,3/5 bei 257 Ratings impliziert mathematisch, dass es Kritik gibt, sie ist aber nicht in der gefilterten Anzeige zu sehen, und Reddit-/Blog-Diskussionen liefern keine Treffer für das Cranberry-Miso. Folgende Punkte sind daher **abgeleitete Hypothesen** aus typischen Pain-Points der Kategorie (Recipe-Saver-Apps mit AI-Import) und der Apple-Store-Datenlage:

- **Aggressive IAP-Struktur als potenzieller Reibungspunkt.** Sieben verschiedene IAP-Preise (6,99 € / 9,99 € / 19,99 € / 29,99 € / 39,99 € / 39,99 € / 49,99 €) deuten auf ein komplexes Paywall-/Abo-Modell mit häufiger Konfrontation hin. Das ist in der Kategorie ein typischer Ein-Stern-Magnet.
- **Erwartbare Import-Genauigkeitsprobleme.** Branchenweit (ReciMe, Recipe Notes, Flavorish) berichten User regelmäßig: *"works best when the recipe is written out in the caption"* (ReciMe-Hilfeartikel) — Reels/TikToks ohne klare Caption werden oft falsch oder unvollständig geparst. Das ist ein strukturelles Problem aller AI-Recipe-Importer und betrifft Miso ebenso.
- **iOS 17+ Mindestanforderung.** Schließt User auf älteren Geräten aus.
- **Nur DE/EN, kein iCloud-Sync nachgewiesen.** User mit Multi-Device-Setup (iPad + iPhone + Mac) finden hier keine explizite Sync-Aussage.
- **Keine Android-/Web-Version.** Cross-Platform-User sind ausgeschlossen.

> **Empfehlung:** Vor strategischen Entscheidungen sollten wir 1–2 echte Negativ-Reviews beschaffen (z. B. via App-Annie/Sensor-Tower, oder Miso einfach selbst kaufen und 30 Tage nutzen). Aktuell sind die Pain-Points nur indirekt belegt.

---

## E. Design & UX observations

Aus Store-Beschreibung, Screenshots-Captions (sofern verfügbar) und Reviews lässt sich ableiten:

- **Share-Sheet-First-Architektur.** Der Haupt-Entry-Point ist iOS' natives Share-Sheet, nicht ein "Import"-Button in der App selbst. Das reduziert die kognitive Hürde drastisch: User entdeckt Rezept in Reels → tippt "Teilen" → wählt Miso → fertig. Unsere Web-App hat diesen Flow strukturell nicht (User muss URL kopieren → App öffnen → einfügen).
- **Minimalistisches, ästhetisches Design** als beworbenes und gelobtes Differenzierungsmerkmal. Cranberry positioniert das App im Premium-Lifestyle-Segment (Apple-Aesthetik, Dark Mode beworben).
- **Konsolidierte Übersicht statt verstreuter Listen.** Die Marketing-Botschaft ("alle Rezepte an einem Ort, statt verstreut über Insta, TikTok, Facebook") suggeriert eine starke, übersichtliche Hauptansicht.
- **Custom Farben & Icons pro Rezept / Sammlung** — Personalisierung als emotionales Bindungselement (Vergleich: Notion-Feeling).
- **Diätfilter als strukturierte Facette**, nicht nur als freier Tag — d.h. vegan/vegetarisch/pescatarisch sind explizite, gefilterte Properties (vermutlich Toggle/Chip-UI).
- **Original-Quelle bleibt sichtbar inkl. Video-Referenz.** User kann jederzeit zur Original-Reel/-Video zurück — wichtig für Vertrauen ("ich kann nachprüfen") und für visuelles Lernen.
- **Offline-First-Versprechen.** UX-Implikation: alle Daten lokal verfügbar; Sync nur bei Bedarf — das ist eine bewusste UX-Entscheidung, kein Bug-Workaround.

---

## F. Derived recommendations for Rezept-App

Jede Empfehlung ist mit einem Belegpunkt aus B/C/D/E verknüpft. Priorisierung:
**P0 = strategisch kritisch / kurzfristig angehen, P1 = wichtig im nächsten Quartal, P2 = nice-to-have / langfristig.**

### F.1 Features to **add** (Lücken, die Miso füllt und wir nicht)

| Prio | Empfehlung | Belegpunkt | Begründung |
|---|---|---|---|
| **P0** | **Meal-Planning-Modul** spezifizieren und planen (Wochenplaner mit Drag-&-Drop von Rezepten auf Wochentage) | B (Miso wirbt prominent damit), CLAUDE.md ("noch NICHT implementiert") | Bereits explizit als bekannte Lücke deklariert; Miso macht es zum Verkaufsargument. Im Konkurrenzumfeld (Miso, ReciMe, Flavorish) ist Meal Planning Standard. |
| **P0** | **Strukturierte Diätfilter** als eigene Property/Facette (vegan, vegetarisch, pescatarisch, glutenfrei …), nicht nur als freier Tag | B, E ("Diätfilter explizit") | Filterbarkeit ist UX-kritisch und wird von Miso als Feature beworben. Tags allein erfüllen das nicht zuverlässig (Schreibweisen-Drift). |
| **P0** | **iOS-Share-Target-Strategie entscheiden:** PWA mit Web-Share-Target API vs. dünner iOS-Wrapper / Shortcut-Integration | B, E (Share-Sheet-First) | Der Haupt-Vorteil von Miso ist der friction-freie iOS-Share-Flow. Solange wir reine Web-App sind, verlieren wir genau diesen Moment der Rezept-Entdeckung. **Decision needed** (siehe G.1). |
| **P1** | **TikTok-Import** als 5. Importpipeline | B (Lücke), Miso bewirbt es prominent | TikTok ist neben Instagram der zweite Massen-Kanal für Kurzform-Rezeptvideos. Anschlussfähig an unsere bestehende Pipeline-Architektur. |
| **P1** | **PDF-Import** (Kochbuch-Scans, Magazinseiten) | B (Lücke), Miso bewirbt es | Niedrige technische Hürde (PDF → Text → Claude), erweitert Zielgruppe um "Kochbuch-Digitalisierer". |
| **P1** | **Custom Collections / Rezeptsammlungen** zusätzlich zu Tags (z. B. "Sonntagsessen", "Schnell nach Feierabend") | B (Miso hat Collections + Tags), E | Tags + Collections sind komplementär. Collections sind kuratiert/manuell, Tags sind facettierbar/automatisch. |
| **P1** | **Offline-Lese-Modus** (PWA mit Service-Worker, gespeicherte Rezepte lokal verfügbar) | B (Miso "komplett offline"), E | Kochen ohne Netz ist ein realer Use-Case (Küche schlechter Empfang, Camping). Niedrig-hängende Frucht für eine PWA. |
| **P2** | **Kosten pro Portion** als optionales Feld / Schätzung | B (Miso wirbt damit) | Differenzierungs-Feature in der Kategorie. Realistisch nur als grobe Schätzung machbar (Preisdaten). Decision needed: Kosten manuell oder Claude-geschätzt? |
| **P2** | **UI-Personalisierung** (Akzentfarbe, Icon pro Rezept/Sammlung) | B, E | Emotionale Bindung, Premium-Anmutung — keine Funktionalität. P2, da nicht wertkritisch. |
| **P2** | **Mehrsprachigkeit (DE / EN)** | B (Miso hat es), CLAUDE.md (offene Lücke) | Bereits als bekannte Lücke deklariert. Niedrige Priorität, solange Hauptmarkt DE ist. |

### F.2 Features to **improve** (haben wir, Miso macht es besser/anders)

| Prio | Empfehlung | Belegpunkt |
|---|---|---|
| **P0** | **Onboarding um den "Insta-Vergessen"-Pain-Point bauen.** Marketing-Copy und Empty-State sollten genau Max Fröhlichs Wording aufgreifen ("speichern → vergessen → kochen"). | C (häufigstes Lob) |
| **P1** | **Visuelle Politur und Empty-States.** Miso wird konsistent für sein "minimalistisches, ästhetisches Design" gelobt. Ein UX-Audit des Recipe-List-, Detail- und Cooking-Mode-Screens lohnt sich. | C, E |
| **P1** | **Original-Video / Original-Quelle prominenter darstellen.** Wir speichern `source_value`, sollten aber im Detail-View einen klaren "Zurück zur Quelle"-CTA und ggf. Video-Embed haben. | E (Miso behält "Original-Video-Referenz" sichtbar) |
| **P2** | **Dark Mode explizit als Feature aufnehmen** und auf der Landing/About-Seite kommunizieren | B, E |

### F.3 Features to **avoid copying** (wo Miso Risiken hat)

| Prio | Empfehlung | Belegpunkt |
|---|---|---|
| **P1** | **Keine fragmentierte 7-Tier-IAP-Struktur.** Miso hat 7 verschiedene IAP-Preise — das wirkt unstrukturiert und ist ein bekannter 1-Stern-Magnet in der Kategorie. Wir sollten ein klares 2-Tier-Modell (Free + Premium) wählen. | D (abgeleitet) |
| **P2** | **Kein blindes Vertrauen in AI-Import-Genauigkeit.** Miso (und alle Wettbewerber) leiden unter Reels ohne Caption. Unser Review-Pass ist hier ein bestehender Vorteil — den nicht aufgeben durch "Auto-Save"-Flows ohne User-Validierung. | D (Branchen-Pain-Point) |
| **P2** | **Kein iOS-only-Lock-in.** Miso schließt Android- und Desktop-User aus. Unsere Web-First-Architektur ist hier strategischer Vorteil — den nicht aufgeben durch reine native App. | D (iOS 17+ Lock) |

### F.4 Differentiators to **emphasize** (wo wir bereits voraus sind)

| Prio | Empfehlung | Belegpunkt |
|---|---|---|
| **P0** | **Kochmodus (Timer, Wake-Lock, Step-by-Step) als Marketing-Hero-Feature** etablieren. Miso bewirbt keinen Kochmodus — das ist eine echte Differenzierung beim eigentlichen Kochvorgang, nicht nur beim Sammeln. | B (Lücke bei Miso) |
| **P0** | **Multi-Sektion-Rezepte ("Für die Soße", "Für den Teig")** klar in Marketing/Demo herausstellen. Miso scheint nur lineare Rezepte zu unterstützen. | B |
| **P1** | **Web-Sharing mit revocable Tokens** als Family-/Friends-Sharing positionieren. Miso bietet kein vergleichbares Web-Read-only-Sharing. | B |
| **P1** | **Cookidoo / schema.org Export** für Thermomix-/Power-User-Nische gezielt ansprechen. | B |
| **P1** | **PDF-Export** als "echtes Kochbuch drucken"-Feature ausspielen | B |
| **P2** | **Drei-stufige Duplikatprüfung** und **Tag-Normalisierung** sind technische Vorteile, die User nicht direkt sehen — aber sie sorgen für ein "saubereres" Datenbild über Zeit. Marketing: "Deine Rezepte bleiben aufgeräumt, automatisch." | B |

---

## G. Open questions

Diese Punkte können wir aus öffentlichen Informationen nicht abschließend klären und sollten gezielt nachgehen:

1. **G.1 (P0): Native iOS-Begleit-App vs. PWA-Strategie.** Ist es wirtschaftlich vertretbar, eine dünne iOS-Begleit-App nur für das Share-Target zu bauen, oder reicht eine PWA mit Web-Share-Target API? Das ist eine Architektur-Entscheidung, die der User treffen muss. **Optionen:**
   a) Reine PWA mit Web-Share-Target (kein App-Store-Eintrag, Reichweite begrenzt)
   b) Dünner iOS-Wrapper (z. B. mit Capacitor) primär für Share-Target
   c) iOS Shortcut-basierte Integration (User installiert Shortcut, kein App-Store)
   d) Status quo: kein nativer Share-Flow

2. **G.2: Hat Miso iCloud-Sync zwischen iPhone/iPad?** Aus der Store-Beschreibung nicht eindeutig ableitbar. Wir sollten das App selbst installieren oder Reviews tiefer durchsuchen.

3. **G.3: Wie genau funktioniert Misos "Diätfilter"?** Sind das automatisch erkannte Properties (Claude/AI) oder manuelle User-Tags? Das beeinflusst, ob wir bei uns automatische Erkennung implementieren oder rein manuell starten.

4. **G.4: Miso-IAPs — was ist gratis, was ist Plus?** Die 7 IAP-Stufen sind unklar zugeordnet. Welche Features sind hinter der Paywall? Wichtig für unsere eigene Monetarisierungsstrategie.

5. **G.5: Echte Negativ-Reviews beschaffen.** Über App-Annie / Sensor Tower / Apple Connect (falls verfügbar) oder durch eigenes Testing über 30 Tage. Aktuell ist unsere Pain-Point-Liste (D) hypothetisch.

6. **G.6: Wie performant ist Misos Import in der Praxis?** Cranberry erwähnt Geschwindigkeit nicht prominent. Eigenes Benchmarking gegen unsere Pipeline (Claude-Latenz, Reel-Genauigkeit) wäre aussagekräftig.

7. **G.7: Cranberry Apps' Roadmap.** Cranberry behauptet "10 Mio. zufriedene User" über alle Apps — ist Miso das Flagship oder ein Side-Bet? Hinweis auf strategisches Investment-Niveau und damit auf Bedrohungslage.

8. **G.8: Verwechslungsgefahr mit "Miso Cook" (id6757978247).** Das andere Miso-App (Vadym Maistruk, UA) bietet **Familien-Haushalts-Sync via QR-Code** — ein starkes Feature, das wir ebenfalls evaluieren sollten, auch wenn es nicht zum Cranberry-App gehört. Sollen wir eine separate Analyse für Miso Cook erstellen?

---

## Zusammenfassung in einem Satz

Miso – Recipe Keeper ist im Kern ein **iOS-Native-Share-Sheet-First-Recipe-Saver mit Premium-Aesthetik, Meal-Planning und Offline-Modus** — die drei Bereiche, in denen wir derzeit am meisten Boden verlieren — während wir mit **Kochmodus, Multi-Sektion-Rezepten, Sharing-Tokens, Cookidoo-Export und Web-Cross-Platform-Reichweite** echte Differenzierung halten, die wir aktiv ausspielen sollten.

---

## Quellen

- [Apple App Store DE — Miso – Recipe Keeper (id6756516262)](https://apps.apple.com/de/app/miso-recipe-keeper/id6756516262)
- [Apple App Store — Miso Cook: Meal Planner (id6757978247, anderes App, zur Abgrenzung)](https://apps.apple.com/us/app/miso-cook-meal-planner/id6757978247)
- [Cranberry Apps Webseite](https://cranberry.app/) (sehr dünn, keine produktspezifischen Infos)
- [misocook.com](https://misocook.com/) (gehört zum *anderen* Miso-App, nicht zu Cranberry)
- [ReciMe Help — Import from TikTok](https://recime.app/help/en/articles/11661452-import-from-tiktok) (Branchen-Pain-Point-Beleg)
- [ReciMe Help — Import from Instagram](https://recime.app/help/en/articles/11596425-import-from-instagram) (Branchen-Pain-Point-Beleg)
- [Choosy.de — Die 10 besten Kochbuch-Apps im Vergleich](https://www.choosy.de/blog/die-10-besten-kochbuch-apps-im-vergleich) (Markt-Kontext DE)
