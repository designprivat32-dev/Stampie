# Stampie — Karten-Designer

Kartenverwaltung und Designer für digitale Wallet-Stempelkarten.

**Live:** <https://stampie-xi.vercel.app/dashboard/karten>

> ⚠️ Das Deployment ist öffentlich erreichbar und Auth ist noch ein Stub — wer den Link
> hat, ist als Demo-Inhaber angemeldet und kann bearbeiten, veröffentlichen und Bilder
> hochladen. Nur Demodaten, keine echten Kundendaten dort ablegen.

## Schnellstart (ohne Docker, ohne PostgreSQL-Installation)

Die Entwicklungsdatenbank ist [PGlite](https://pglite.dev) — echtes PostgreSQL als WASM,
das über einen TCP-Socket das Postgres-Wire-Protokoll spricht. Prisma merkt keinen
Unterschied, es muss aber nichts installiert werden.

```bash
npm install
```

```bash
cp .env.example .env
```

**Terminal 1** — Datenbank (läuft weiter, Daten liegen in `./.pglite`):

```bash
npm run dev:db
```

**Terminal 2** — Schema + Demodaten, einmalig:

```bash
npm run db:setup
```

**Terminal 2** — App:

```bash
npm run dev
```

Danach: <http://localhost:3000/dashboard/karten>

### Alternative: echtes PostgreSQL

`docker compose up -d db` (die `docker-compose.yml` liegt im Projekt) oder ein beliebiges
PostgreSQL 14+. Dann nur `DATABASE_URL` in `.env` anpassen und `npm run dev:db` weglassen.
Für alles außer lokaler Entwicklung ist das der richtige Weg — PGlite ist ein
Einzelprozess ohne Replikation und Backups.

## Deployment (Vercel)

```bash
npx vercel deploy --prod
```

Der `vercel-build`-Skript macht `prisma db push` und den Seed vor `next build`; beides ist
idempotent. Datenbank ist Neon Postgres über die Vercel-Integration, die `DATABASE_URL`
und `DATABASE_URL_UNPOOLED` selbst injiziert.

Drei Fallstricke, die dabei aufgetreten sind und in den Konfigurationsdateien
dokumentiert sind:

- **`.env` darf nicht hochgeladen werden.** Next lädt sie zur Laufzeit, und ein lokales
  `NEXT_PUBLIC_APP_URL=http://localhost:3000` überschreibt still die echte Domain — jeder
  QR-Code und jede Wallet-Asset-URL zeigt dann ins Leere.
- **`.vercelignore`-Muster brauchen einen führenden Slash.** Ein unverankertes `storage/`
  matcht auch `src/lib/storage/` und lässt den Build mit „module not found" scheitern.
- **`directUrl` ist Pflicht.** Neons `DATABASE_URL` zeigt auf den Pooler, durch den keine
  Schemaänderungen laufen.

## Skripte

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run build` | Produktions-Build (inkl. `prisma generate`) |
| `npm test` | Vitest, komplette Suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Schema in die Datenbank schreiben |
| `npm run db:seed` | Demo-Organisation, zwei Filialen, eine Karte, 137 ausgegebene Karten |

Zusätzlich, rein für die visuelle Kontrolle der Symbolbibliothek:

```bash
npx tsx scripts/gen-preview.mts ./tmp
```

## Aufbau

```
Organization (= Kunde)
  ├─ Membership   Nutzer + Rolle
  ├─ Location     Filialen (Stammdaten, Geo)
  └─ Card         beliebig viele Stempelkarten
       ├─ CardDesign   1 Entwurf + 1 veröffentlicht
       ├─ Asset        Logo, Icon, Hero
       ├─ IssuedPass   ausgegebene Karten
       └─ StampEvent   Prüfspur jeder Buchung
```

| Route | Zweck |
|---|---|
| `/dashboard/karten` | Übersicht aller Karten, Plus-Button legt neu an |
| `/dashboard/karten/[cardId]` | Karten-Designer |
| `/dashboard/karten/[cardId]/stempeln` | Kassenansicht |
| `/s/[serial]` | Ziel des Barcodes |
| `/p/[token]` | Testkarten-Landing für den QR |

### Rollen

| Rolle | Sieht | Gestalten | **Stempeln** |
|---|---|---|---|
| `AGENCY` | alle Karten aller Kunden | ja | **nein** |
| `OWNER` / `MEMBER` | nur eigene Organisation | ja | **ja** |

Ein Stempel gehört dem, der etwas verkauft hat — der Agentur-Zugang darf deshalb keine
buchen. Das wird serverseitig in `assertStampAccess` geprüft, nicht nur in der Oberfläche.

## Architektur in drei Sätzen

1. **Ein Renderer, eine Wahrheit.** Die Stempelreihe entsteht ausschließlich in
   [`src/lib/cards/render-strip.ts`](src/lib/cards/render-strip.ts) als PNG. Die Live-Vorschau
   im Browser lädt dasselbe Bild über `GET /api/preview/strip` — es gibt bewusst keine
   zweite Implementierung des Rasters in React.
2. **Ein Schema, zwei Stufen.** [`cardDesignDraftSchema`](src/lib/cards/schema.ts) validiert
   Struktur und PassKit-Limits, `cardDesignPublishSchema` verschärft es um alles, was vor
   der Ausgabe an Kunden stimmen muss (Impressum, Datenschutz, Icon, Kontrast). Client und
   Server benutzen dieselbe Datei; die Server Action entscheidet.
3. **Mandantentrennung an jeder Kante.** Jede Server Action und der Seiteneinstieg rufen
   `assertCardAccess()`, jede Query filtert zusätzlich über `cardId`. Eine Karte ohne
   Zugriff liefert 404, nicht 403 — eine geratene ID darf nicht bestätigen, dass es sie gibt.

## Was noch nicht echt ist

| Bereich | Zustand |
|---|---|
| Auth | Stub in [`src/lib/auth/session.ts`](src/lib/auth/session.ts) — löst den User aus `DEV_SESSION_USER_EMAIL` auf. Die Tenancy-Prüfung darüber ist echt. |
| Apple Wallet | [`MockPassBuilder`](src/lib/pass/mock-pass-builder.ts) erzeugt ein vollständiges `.pkpass`-ZIP inkl. `manifest.json`, aber ohne `signature`. **iOS lehnt den Pass deshalb ab.** Für echte Pässe: Apple Developer Program (99 €/Jahr), Pass Type ID Zertifikat, PKCS#7-Signatur über `manifest.json`. |
| Google Wallet | Signierung ist **implementiert** ([`google-pass-builder.ts`](src/lib/pass/google-pass-builder.ts), RS256). Sobald `GOOGLE_ISSUER_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` und `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` gesetzt sind, entsteht ein echter Save-Link. Ohne sie fällt der Builder auf einen Mock zurück, den Google ablehnt. |

Der Testkarten-Dialog zeigt eine Warnung, solange für eine der beiden Plattformen keine
Signierung konfiguriert ist — damit niemand erst beim Scannen merkt, dass die Karte nicht
im Wallet landet.

| Bereich | Zustand |
|---|---|
| E-Mail | `console`-Adapter; SMTP-Implementierung fehlt. |
| Apple-Aktualisierung | Ein neuer Stempel erreicht iOS nicht — dafür fehlt der PassKit-Web-Service samt APNs. Google wird per `PATCH` aktualisiert. |

## Testabdeckung

```bash
npm test
```

326 Tests: Rasterberechnung (N = 3, 5, 6, 10, 12, 20 plus Randfälle), PNG-Ausgabe in allen
drei Auflösungen, WCAG-Kontrast, das Zod-Schema inklusive jeder PassKit-Grenze, das
PassKit-/Google-Mapping, die Upload-Pipeline (Magic Bytes, SVG-Sanitizing, EXIF), der
ZIP-Writer, der Editor-Store inklusive Undo/Redo sowie die Stempel-Regeln
(Doppelscan-Sperre, Einlösen, Seriennummern-Erkennung).
