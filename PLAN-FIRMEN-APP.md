# Plan — Firmen-App (Betriebs-App zum Stempeln)

Stand: Entwurf, gemeinsam mit sivab erarbeitet.

## Ziel in einem Satz

Eine native App für Betriebe (Firmen), mit der sie sich anmelden, Kunden-QRs
scannen und damit deren Stempelkarte um 1 erhöhen — streng auf die eigenen Kunden
begrenzt. Die Web-App „Stampie" bleibt das Admin-Werkzeug, mit dem **wir** Firmen
anlegen und ihnen Zugangsdaten geben.

## Festgelegte Entscheidungen

- **App-Art:** echte native App für iOS **und** Android.
- **Login:** Benutzername + Passwort (kein öffentliches Registrieren).
- **Start-Passwort:** wird von uns vergeben; die App erzwingt beim ersten Login eine Änderung.

## Was schon existiert (wird wiederverwendet)

- **Stempel-Logik:** Zähler erhöhen, Doppelscan-Sperre, Einlösen, Prüfspur
  (`src/actions/stamping.ts`, `src/lib/cards/stamping.ts`).
- **Mandantentrennung / Sicherheit:** Beim Stempeln prüft `assertStampAccess`, ob der
  Angemeldete zum Betrieb der Karte gehört. Scannt der Friseur die Karte eines
  Pizzeria-Kunden, wird sie als „nicht gefunden" abgelehnt. → Deine Sicherheitsanforderung
  ist im Prinzip schon abgedeckt; es fehlt nur das echte Login, das dem Server sagt,
  *welcher* Betrieb scannt.
- **QR-Scanner-Prinzip** in der Web-Kassenansicht (`jsqr`).
- **Kartenausgabe** (Pass/QR erzeugen).
- **Datenmodell:** Organization (= Firma), Membership (Nutzer↔Firma+Rolle), Card, IssuedPass, StampEvent.
- **Kundenverwaltung** (gerade gebaut): Firmen mit Kontaktdaten anlegen/suchen.

## Der eigentliche Brocken: echtes Login + API

Aktuell ist die Anmeldung nur ein Platzhalter (`DEV_SESSION_USER_EMAIL`). Für die App
brauchen wir:

1. **Echte Authentifizierung**
   - Nutzer mit `username`, `passwordHash` (bcrypt/argon2), `mustChangePassword`-Flag.
   - Nutzer ist über `Membership` an genau eine Organization (Firma) gebunden.
   - Kein Self-Registrieren. Konten entstehen nur im Admin.
2. **JSON-API** (weil eine native App keine „Server Actions" aufrufen kann)
   - `POST /api/app/login` → prüft username+Passwort → gibt einen **Token** zurück.
   - `GET  /api/app/me` → wer bin ich, welche Firma, muss ich Passwort ändern?
   - `POST /api/app/change-password` → Passwort setzen (löscht das mustChange-Flag).
   - `POST /api/app/stamp` → Body: gescannte Serial → läuft durch `assertStampAccess`
     → +1 oder Ablehnung. (Kern der App.)
   - `POST /api/app/cards/issue` → Karte/QR für einen neuen Kunden ausgeben.
   - `GET  /api/app/cards` → eigene Karten der Firma.
   - **Token-Auth:** App schickt den Token bei jeder Anfrage im `Authorization`-Header.
   - **Login-Ratelimit** gegen Passwort-Raten.

## Admin-Seite (Stampie-Web)

- Beim Anlegen einer Firma zusätzlich einen **Login erzeugen**: Benutzername + ein
  zufälliges **Start-Passwort**, das angezeigt wird (zum Weitergeben). `mustChangePassword`
  wird gesetzt.
- Baut auf der neuen Kundenverwaltung auf.

## Die App (React Native mit Expo — ein Code für iOS + Android)

Bildschirme:
1. **Login** (Benutzername + Passwort).
2. **Passwort ändern** (erzwungen beim ersten Login).
3. **Scanner** — Kamera an (`expo-camera`), Kunden-QR scannen → `POST /api/app/stamp`.
   **Klare Rückmeldung nach jedem Scan** (grün = Erfolg, rot = Fehler), z. B.:
   - Erfolg: „Gestempelt — 4/10"
   - Karte voll: „Belohnung einlösen!"
   - Fremde Karte: „Gehört nicht zu deinem Betrieb" (wird abgelehnt)
   - Doppelscan-Sperre: „Gerade eben schon gestempelt"
   - Ungültig: „QR nicht gefunden"
   - Netzfehler: „Keine Verbindung — erneut versuchen"
   Die Stempel-Aktion liefert diese Fälle bereits als Fehlercodes; die API reicht sie
   durch, die App zeigt Farbe + Text (idealerweise mit kurzem Ton/Vibration).
4. **Karte ausgeben** — neuen Kunden mit Karte/QR versorgen.
5. **Abmelden.**

## Reihenfolge / Phasen

1. **Backend: Auth + API** (login, me, change-password, stamp) — Fundament, unabhängig
   von der App wertvoll.
2. **Admin: Firmen-Login anlegen** (Benutzername + Start-Passwort anzeigen).
3. **App-Grundgerüst:** Login → Passwort ändern → Scanner → +1. (Kern der Anforderung.)
4. **Karten ausgeben** aus der App.
5. **Feinschliff + Veröffentlichung:** Icons/Namen, Sitzungs-Ablauf, Passwort-vergessen,
   Store-Freigabe.

## Realistische Einordnung

- Eine native App ist ein echtes Projekt (mehrere Wochen; Store-Konten: Apple Developer
  ~99 €/Jahr, Google Play 25 € einmalig).
- Der Backend-/Auth-Teil braucht ihr sowieso — der lohnt sich unabhängig von der App.
- Empfehlung: mit Phase 1–3 einen lauffähigen Kern bauen (anmelden + scannen + stempeln),
  Rest schrittweise.

## Offene Detailfragen (später entscheiden)

- Ein Login pro Firma oder mehrere Mitarbeiter-Konten je Firma?
- Soll die App später auch die NFC-Stempel-Variante können? (Expo kann NFC.)
- Produktivbetrieb weiter auf Vercel + Neon (wie jetzt)?
- Passwort-vergessen: per E-Mail (setzt E-Mail pro Firma voraus) oder Reset durch uns im Admin?
