# Push-Benachrichtigungen — Go-Live-Setup

Der Code für Web-Push-Benachrichtigungen ist vollständig implementiert. Damit
Benachrichtigungen tatsächlich versendet werden, sind drei manuelle Schritte nötig
(Code allein genügt nicht, analog zu `google-auth-golive.md`).

## Was implementiert ist

- Tabelle `push_subscriptions` (Migration `20260603000000_push_subscriptions.sql`)
- Server-Versand `lib/push.ts` (`sendPushToUser`) über `web-push` (VAPID)
- Subscribe/Unsubscribe-API `app/api/push/subscribe` (POST/DELETE)
- Geräte-Opt-in in den Einstellungen (`components/NotificationsToggle.tsx`)
- Service-Worker-Handler für `push` + `notificationclick` (`app/sw.ts`)
- Auslöser: Library-Sharing-Ereignisse (geteilte Sammlung erhalten,
  Weiterteilen-Anfrage an Eigentümer, Anfrage genehmigt)

## 1. VAPID-Schlüssel erzeugen

```bash
npx web-push generate-vapid-keys
```

Ergibt ein Schlüsselpaar (Public + Private). Der **Private Key ist geheim** und darf
nicht ins Repository.

## 2. Umgebungsvariablen setzen

In **Vercel** (Project → Settings → Environment Variables) und lokal in `.env.local`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public key>
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:deine-adresse@example.com
```

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` wird zur Build-Zeit in den Client eingebettet → nach
  dem Setzen **neu deployen**.
- Ohne diese Variablen ist das Feature ein No-Op: der Einstellungs-Toggle zeigt
  „nicht verfügbar“, `sendPushToUser` versendet nichts. Die App funktioniert normal weiter.

## 3. Migration anwenden

Die Tabelle `push_subscriptions` in Supabase anlegen — entweder über die SQL-Datei
`supabase/migrations/20260603000000_push_subscriptions.sql` (SQL-Editor) oder via
`supabase db push`.

## Testen

1. Nach dem Deploy in den **Einstellungen** „Push-Benachrichtigungen“ aktivieren und
   die Browser-Abfrage erlauben (iOS: nur als installierte PWA, iOS 16.4+).
2. Mit einem zweiten Konto eine Sammlung mit dem ersten teilen → das erste Konto
   sollte eine Benachrichtigung erhalten (auch wenn die App nicht im Vordergrund ist).
3. Tippen auf die Benachrichtigung öffnet die passende Seite.

## Grenzen

- iOS unterstützt Web Push nur für **installierte** PWAs ab iOS 16.4.
- Benachrichtigungen erreichen nur Empfänger, die ein Konto **und** ein aktives
  Geräte-Abo haben. E-Mail-Einladungen an noch nicht registrierte Adressen lösen
  (wie bisher) nur die E-Mail aus.
