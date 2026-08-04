# PLAN — Karten-Designer `/dashboard/[locationId]/karte`

> Status: **umgesetzt.** Etappen 0–6 fertig, 278 Tests grün, `tsc --noEmit` sauber,
> `next build` sauber. Abweichungen vom Plan stehen in §16.
> UI-Texte Deutsch, Code/Kommentare Englisch. Dieses Dokument: Deutsch, Bezeichner Englisch.

---

## 0. Ausgangslage

`C:\Users\ntmtk\Desktop\Computer\stampie` ist **leer** — kein `package.json`, kein Git, kein
Bestandscode. Es gibt also keine „vorhandenen Konventionen", nach denen ich mich richten könnte.

Der Auftrag sagt „Auth, Billing, Onboarding existieren bereits". Hier existiert nichts davon.
Konsequenz für den Plan: Ich scaffolde das Projekt-Gerüst mit und **stubbe Auth/Tenancy hinter
einem Interface** (`lib/auth/session.ts`), damit der spätere echte Auth-Layer nur eine
Implementierung austauscht. Siehe **Offene Frage 1** — falls es doch ein Bestandsrepo gibt,
werfe ich das Scaffold weg und passe mich an.

---

## 1. Scope

**Gebaut wird:** Datenmodell, Zod-Validierung, Strip-Renderer, Preview-Stack, 4 Editor-Tabs,
Vorlagen, Autosave/Undo/Versionen, Testkarten-Flow, Upload-Pipeline, Tests.

**Nicht gebaut:** Auth-UI, Billing, Onboarding, echte Pass-Signierung (Zertifikate, PKCS#7),
Push-Updates an ausgegebene Karten (`webServiceURL`/APNs), Stempel-Erfassung im Laden.

**Gestubbt (Interface sauber, Implementierung Mock):**
- `PassBuilder` — `.pkpass`-Bytes + Google-Save-URL
- `SessionProvider` — eingeloggter User + Zugriff auf Location
- `StorageAdapter` — S3-kompatibel, lokal Filesystem

---

## 2. Stack-Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Framework | Next.js 15 App Router, TS `strict` + `noUncheckedIndexedAccess` | vorgegeben |
| Styling | Tailwind v4 + shadcn/ui | vorgegeben |
| Editor-State | Zustand + eigene `temporal`-Middleware (Undo/Redo) | vorgegeben; `zundo` als Fertigbaustein, sonst eigen |
| Formulare | React Hook Form + `@hookform/resolvers/zod` | vorgegeben |
| DB | Prisma + PostgreSQL | vorgegeben |
| Bilder | `sharp` | vorgegeben |
| Tests | **Vitest** + `@testing-library/react` | schnell, ESM-nativ, gute Snapshot-Story für Buffer-Tests |
| SVG-Sanitizing | `svgo` (Struktur) + eigene Allowlist über `xml2js`-freien Parser | `dompurify`+`jsdom` als Alternative — siehe Offene Frage 6 |
| Crop-UI | `react-easy-crop` | vorgegeben, nur Auswahl-Rechteck; **Zuschnitt passiert serverseitig mit sharp** |
| QR | `qrcode` (Node, Buffer/DataURL) | serverseitig, kein Client-Lib nötig |
| Farb-Utils | eigen (`lib/color/*`), keine Lib | WCAG-Formel ist 20 Zeilen und muss testbar sein |

Keine `any`. Feldtypen als diskriminierte Unions.

---

## 3. Dateien

```
prisma/
  schema.prisma
  seed.ts                                   # 1 Org, 1 User, 2 Locations, Demo-Design
src/
  app/
    dashboard/[locationId]/karte/
      page.tsx                              # Server Component: lädt Design + Location, Tenant-Check
      loading.tsx
      error.tsx
      _components/
        card-editor-shell.tsx               # 2-Spalten-Layout, <1024px Collapse
        editor-tabs.tsx
        tabs/branding-tab.tsx
        tabs/program-tab.tsx
        tabs/texts-tab.tsx
        tabs/advanced-tab.tsx
        preview/preview-pane.tsx            # Umschalter iOS/Google, Front/Back, Hell/Dunkel
        preview/apple-store-card.tsx        # pixelnaher iOS-Nachbau (Chrome, nicht Strip)
        preview/apple-store-card-back.tsx
        preview/google-loyalty-card.tsx
        preview/google-loyalty-card-back.tsx
        preview/stamp-strip-img.tsx         # <img src="/api/preview/strip?...">
        preview/preview-controls.tsx        # Stempel-Slider, Export-Button
        dialogs/template-dialog.tsx         # Branchen-Vorlagen
        dialogs/test-card-dialog.tsx        # QR + E-Mail
        dialogs/publish-dialog.tsx          # Warnung + betroffene Karten
        dialogs/logo-crop-dialog.tsx
        dialogs/version-history-dialog.tsx
        save-status-indicator.tsx
        contrast-warning.tsx
        platform-support-badge.tsx          # "nur Apple" / "nur Google"
    api/
      preview/strip/route.ts                # GET, signierte Query -> PNG, Cache
      test-card/[token]/route.ts            # PUBLIC: UA-Sniffing -> .pkpass | Google-Redirect
    p/[token]/page.tsx                      # PUBLIC Landing für QR (Fallback ohne UA-Match)
  actions/
    card-design.ts                          # saveDraft, publish, restoreVersion, applyTemplate
    assets.ts                               # uploadAsset, deleteAsset
    test-card.ts                            # createTestCardToken, sendTestCardEmail
  lib/
    cards/
      render-strip.ts                       # renderStripImage(...)  <- Kern
      stamp-layout.ts                       # PURE: computeStampLayout(n, canvas) -> Layout
      stamp-icons.ts                        # kuratierte SVG-Bibliothek (14 Icons)
      strip-svg.ts                          # Layout + Icon -> SVG-String (dann sharp)
      apple-pass-json.ts                    # CardDesign -> pass.json (storeCard)
      google-loyalty.ts                     # CardDesign -> LoyaltyClass/Object
      platform-support.ts                   # Feld -> {apple, google} Matrix
      templates.ts                          # 8 Branchen-Presets
      schema.ts                             # cardDesignSchema (Draft/Publish)
      defaults.ts
    color/
      contrast.ts                           # relativeLuminance, contrastRatio, autoFix
      extract-palette.ts                    # sharp -> dominante Farben
      convert.ts                            # hex <-> rgb(), Apple-rgb()-Strings
    images/
      pipeline.ts                           # validate -> re-encode -> Varianten @1x/@2x/@3x
      magic-bytes.ts
      sanitize-svg.ts
    storage/
      index.ts                              # StorageAdapter Interface
      s3-adapter.ts
      fs-adapter.ts
    pass/
      pass-builder.ts                       # PassBuilder Interface
      mock-pass-builder.ts                  # echtes QR, Dummy-URL, unsigniertes .pkpass-Zip
    auth/session.ts                         # STUB: getSession(), assertLocationAccess()
    db.ts
    signed-query.ts                         # HMAC für /api/preview/strip
  stores/
    card-editor-store.ts                    # Zustand + temporal + autosave-Trigger
  types/
    card-design.ts                          # abgeleitet aus Zod (z.infer), keine Doppelpflege
tests/
  stamp-layout.test.ts                      # N = 3,5,6,10,12,20
  render-strip.test.ts                      # Dimensionen, 3 Scales, Determinismus
  contrast.test.ts
  card-design-schema.test.ts
  apple-pass-json.test.ts                   # Feldlimits
  images-pipeline.test.ts                   # Magic Bytes, SVG-Sanitizing
```

---

## 4. Datenmodell

Das vorgegebene Schema referenziert `Location`, aber es fehlen `Asset`, Tenancy und die
Versionierung. Vorschlag (Ergänzungen markiert):

```prisma
// ---------- Tenancy (Stub-tauglich, ersetzt später echtes Auth-Schema) ----------
model Organization {
  id        String     @id @default(cuid())
  name      String
  locations Location[]
  members   Membership[]
}

model User {
  id      String       @id @default(cuid())
  email   String       @unique
  name    String?
  members Membership[]
}

model Membership {
  id     String @id @default(cuid())
  userId String
  orgId  String
  role   Role   @default(MEMBER)      // OWNER | MEMBER | AGENCY
  user   User         @relation(fields: [userId], references: [id])
  org    Organization @relation(fields: [orgId],  references: [id])
  @@unique([userId, orgId])
}

model Location {
  id           String  @id @default(cuid())
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id])
  name         String
  street       String?
  postalCode   String?
  city         String?
  phone        String?
  website      String?
  openingHours Json    @default("[]")   // Vorbefüllung Tab 3
  latitude     Float?
  longitude    Float?
  designs      CardDesign[]
  passes       IssuedPass[]
}

// ---------- Assets ----------
model Asset {
  id          String    @id @default(cuid())
  locationId  String
  location    Location  @relation(fields: [locationId], references: [id])
  kind        AssetKind             // LOGO | ICON | HERO | STAMP_ICON
  mimeType    String                // immer image/png nach Re-Encode
  width       Int
  height      Int
  bytes       Int
  storageKey  String                // Basis-Key; Varianten: `${key}@1x.png` etc.
  createdAt   DateTime  @default(now())
  @@index([locationId, kind])
}

// ---------- Design ----------
model CardDesign {
  id           String   @id @default(cuid())
  locationId   String
  location     Location @relation(fields: [locationId], references: [id])
  status       DesignStatus @default(DRAFT)
  version      Int      @default(1)

  backgroundColor String @default("#1a1a1a")
  foregroundColor String @default("#ffffff")
  labelColor      String @default("#cccccc")
  logoAssetId     String?
  iconAssetId     String?
  heroAssetId     String?

  stampGoal        Int    @default(10)
  stampIcon        String @default("coffee")
  stampIconAssetId String?
  emptyStampStyle  String @default("outline")
  rewardText       String @default("")
  programName      String @default("")
  cardTitle        String?
  stampLabel       String @default("Stempel")
  backFields       Json   @default("[]")

  barcodeFormat String   @default("QR")
  geoLocations  Json     @default("[]")
  expiresAt     DateTime?
  shareable     Boolean  @default(true)          // + "Karte teilbar" aus Tab 4

  // + Publish-Bestätigung bei Kontrast < 3:1 (Audit)
  contrastOverrideBy String?
  contrastOverrideAt DateTime?

  versions  CardDesignVersion[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([locationId, status])
  @@unique([locationId, status])   // + genau 1 DRAFT und 1 PUBLISHED je Location
}

// + Versionshistorie
model CardDesignVersion {
  id           String   @id @default(cuid())
  designId     String
  design       CardDesign @relation(fields: [designId], references: [id], onDelete: Cascade)
  locationId   String                       // denormalisiert -> Tenant-Filter ohne Join
  version      Int
  snapshot     Json                         // vollständiges, Zod-valides CardDesignInput
  publishedAt  DateTime @default(now())
  publishedBy  String
  @@unique([designId, version])
  @@index([locationId, publishedAt])
}

// + für "Anzahl betroffener Karten" und die Testkarte
model IssuedPass {
  id           String   @id @default(cuid())
  locationId   String
  location     Location @relation(fields: [locationId], references: [id])
  serial       String   @unique
  isTest       Boolean  @default(false)
  stamps       Int      @default(0)
  designVersion Int
  createdAt    DateTime @default(now())
  @@index([locationId, isTest])
}

// + Kurzlebiges Token für den QR-Code der Testkarte
model TestCardToken {
  id         String   @id @default(cuid())
  token      String   @unique      // 32 Byte random, base64url
  locationId String
  designId   String
  snapshot   Json                  // Design zum Zeitpunkt des Klicks (Draft testbar!)
  expiresAt  DateTime              // now + 30 min
  usedCount  Int      @default(0)
  createdAt  DateTime @default(now())
  @@index([expiresAt])
}

enum DesignStatus { DRAFT PUBLISHED }
enum AssetKind    { LOGO ICON HERO STAMP_ICON }
enum Role         { OWNER MEMBER AGENCY }
```

### Draft/Published-Modell

Zwei **Zeilen** je Location (`@@unique([locationId, status])`), nicht ein Status-Feld auf einer
Zeile. Grund: „Änderungen wirken erst nach Veröffentlichen" ist sonst nicht darstellbar —
der Editor schreibt bei jedem Autosave in DRAFT, während PUBLISHED unverändert die
ausgegebenen Karten speist. `publish()` kopiert DRAFT → PUBLISHED, `version++`, schreibt
`CardDesignVersion`. Siehe **Offene Frage 2**.

### `backFields` als diskriminierte Union

```ts
type BackField =
  | { id: string; type: 'text';    label: string; value: string }
  | { id: string; type: 'url';     label: string; value: string }      // linksModuleData
  | { id: string; type: 'phone';   label: string; value: string }      // linksModuleData
  | { id: string; type: 'address'; label: string; value: string }
  | { id: string; type: 'hours';   label: string; value: string }
  | { id: string; type: 'legal';   label: string; value: string;
      kind: 'imprint' | 'privacy' | 'terms' }                          // Pflicht bei Publish
```

`id` für stabiles Drag & Drop. `legal` mit `kind` macht die Publish-Prüfung eindeutig statt
per Label-String-Matching.

---

## 5. Zod als einzige Wahrheit

`lib/cards/schema.ts`:

```ts
export const cardDesignDraftSchema = z.object({ ... })      // erlaubt leere Pflichttexte
export const cardDesignPublishSchema = cardDesignDraftSchema.superRefine(...)
export type CardDesignInput = z.infer<typeof cardDesignDraftSchema>
```

Zwei Stufen sind nötig, weil ein frisch angelegter Entwurf noch keinen Programmnamen,
keine Belohnung, kein Icon und keine Rechts-Links hat — sonst kann Autosave nie speichern.
Es bleibt **ein** Basisschema; Publish ist eine Verschärfung darauf, keine Kopie.

Abgebildete Limits:

| Regel | Ort |
|---|---|
| `stampGoal` 3–20 int | draft |
| Farben `#rrggbb`, case-insensitiv | draft |
| `geoLocations` max. **10**, `maxDistance` 10–5000 m, `relevantText` ≤ 60 Zeichen | draft |
| `backFields` ≤ 50, Label ≤ 40, Wert ≤ 500 | draft |
| `barcodeFormat` ∈ `QR|CODE128|PDF417|AZTEC` | draft |
| `secondaryFields` ≤ 4, `auxiliaryFields` ≤ 4, `headerFields` ≤ 3 | draft (Editor erzeugt sie) |
| `programName` non-empty ≤ 30 | **publish** |
| `rewardText` non-empty ≤ 80 | **publish** |
| `iconAssetId` gesetzt (icon.png ist Pflicht, sonst Pass ungültig) | **publish** |
| genau ein `legal.kind === 'imprint'` und ein `'privacy'` | **publish** |
| Kontrast ≥ 3:1 **oder** `contrastOverrideAt` gesetzt | **publish** |
| `expiresAt` in der Zukunft | publish |

Server Actions validieren *immer* serverseitig gegen dasselbe Objekt. Client-Resolver ist
Komfort.

---

## 6. `render-strip.ts` — der Kern

```ts
export type StripTarget = 'apple' | 'google'
export function renderStripImage(
  design: CardDesign, currentStamps: number, scale: 1 | 2 | 3,
  target?: StripTarget,                  // default 'apple'
): Promise<Buffer>
export function renderStripImageSet(design, currentStamps, target): Promise<Record<'1x'|'2x'|'3x', Buffer>>
```

Canvas @1x: Apple `375×123`, Google `1032×336` (Google @1x = die Zielgröße, 3:1; `scale`
bleibt für Apple relevant, für Google erzeugen wir nur 1×).

**Pipeline:** `computeStampLayout()` → `buildStripSvg()` → `sharp(Buffer.from(svg)).png()`.
Nur ein Renderer, ein SVG-Generator, drei Rasterungen. Kein Canvas, kein Headless-Browser.

### `computeStampLayout(n, canvas)` — pure, ohne sharp, deshalb gut testbar

```
padX = round(canvasW * 0.032)          // 12 @375
padY = round(canvasH * 0.081)          // 10 @123
rows = n <= 5 ? 1 : 2                  // 6..12 und 13..20 beide 2 Reihen
cols = ceil(n / rows)
cell = min( (canvasW - 2*padX) / cols,
            (canvasH - 2*padY) / rows,
            MAX_CELL )                 // MAX_CELL = canvasH * 0.52  -> N=3 wird nicht riesig
gap  = cell * 0.18
icon = cell - gap
```

Die geforderte Regel „13–20 → zwei Reihen mit **kleineren** Icons" fällt aus der Formel
heraus, statt hardcoded zu sein:

| N | rows | cols | cell @1x | icon @1x |
|---|---|---|---|---|
| 3 | 1 | 3 | 63.9 (MAX_CELL) | 52.4 |
| 5 | 1 | 5 | 63.9 (MAX_CELL) | 52.4 |
| 6 | 2 | 3 | 51.5 (höhenbegrenzt) | 42.2 |
| 10 | 2 | 5 | 51.5 | 42.2 |
| 12 | 2 | 6 | 51.5 | 42.2 |
| 20 | 2 | 10 | 35.1 (breitenbegrenzt) | 28.8 |

Grid horizontal und vertikal zentriert; unvollständige letzte Reihe zentriert
(N=7 → 4 oben, 3 unten mittig). Alle Werte in Layout-Einheiten @1x, Rasterung multipliziert
mit `scale` — dadurch sind @2x/@3x garantiert deckungsgleich, nur schärfer.

### Stempel-Zustände

- **gestempelt:** Icon-Pfad gefüllt mit `foregroundColor`, `opacity 1`
- **offen:** je `emptyStampStyle`
  - `outline` → Kreis, `stroke = foregroundColor`, 2 px @1x, `fill none`
  - `transparent` → Icon in `foregroundColor` bei `opacity 0.25`
  - `dashed` → Kreis, gestrichelt `stroke-dasharray 4 3`

Der Auftrag nennt in §1 zwei Zustände („25 % oder Umriss"), in Tab 2 drei
(`Umriss/transparent/gestrichelt`). Ich lese das als: **drei** Auswahlmöglichkeiten, die die
zwei genannten Techniken abdecken. Siehe **Offene Frage 4**.

### Icons

Die 14 kuratierten Icons liegen als getrimmte, `viewBox="0 0 24 24"`-normalisierte
Path-Daten in `stamp-icons.ts` (kein Datei-IO im Renderer). Eigene Uploads und Emoji werden
beim **Upload** zu einem 128×128-PNG normalisiert und als `STAMP_ICON`-Asset abgelegt; der
Renderer bettet sie als Base64-`<image>` ins SVG. Emoji **nicht** als Text rendern —
librsvg/sharp bräuchte dafür eine installierte Farb-Emoji-Font, die auf dem Server nicht
verlässlich vorhanden ist. Stattdessen bundle ich das Twemoji-SVG-Set (CC-BY 4.0) und mappe
den Emoji-Codepoint auf eine SVG-Datei. Siehe **Offene Frage 5**.

---

## 7. Vorschau

`GET /api/preview/strip?d=<designId>&s=<stamps>&t=apple|google&x=<scale>&v=<hash>&sig=<hmac>`

- `v` = stabiler Hash über die renderrelevanten Design-Felder → Cache-Buster **und**
  Cache-Key: `Cache-Control: public, max-age=31536000, immutable`. Änderung des Designs
  ergibt neue URL, kein Flackern durch Re-Request identischer Bilder.
- `sig` = HMAC über die Query (`lib/signed-query.ts`). Verhindert, dass die Route zum
  offenen Bild-Renderer für Fremde wird, ohne die Vorschau an eine Session zu binden.
- In-Memory-LRU (200 Einträge) + optional `unstable_cache`. Ein Render liegt bei ~8–15 ms.
- Debounce 150 ms passiert im Store; die `<img>`-URL wechselt erst nach Debounce.
  `stamp-strip-img.tsx` hält das alte Bild sichtbar bis `onLoad` des neuen → kein Flackern.

**Karten-Chrome** (Feldpositionen, Radien, Schrift, iOS-Statusleiste, Google-Karte) wird in
React nachgebaut — das ist *kein* zweiter Strip-Renderer, die Stempelreihe kommt in beiden
Vorschauen aus derselben Route. Die Regel „ein Renderer, eine Wahrheit" gilt für den Strip.

**„Als Bild exportieren"**: client-seitig via `html-to-image` auf den Preview-Container,
2× Pixelratio. Der Strip ist darin ein `<img>` von unserer Route, also identisch zur echten
Karte. Alternative wäre ein serverseitiger Voll-Renderer — Aufwand steht in keinem Verhältnis.

---

## 8. Editor-State

`stores/card-editor-store.ts`:

```ts
interface CardEditorState {
  design: CardDesignInput
  savedAt: Date | null
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  previewPlatform: 'apple' | 'google'
  previewSide: 'front' | 'back'
  previewTheme: 'light' | 'dark'
  simulatedStamps: number
  set<K extends keyof CardDesignInput>(key: K, value: CardDesignInput[K]): void
  ...
}
```

- Undo/Redo über `temporal`-Middleware, nur `design` wird getrackt (nicht Preview-Toggles).
  `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, global gebunden außer in Textfeldern (dort native
  Undo-Semantik zuerst).
- Autosave: 2 s Debounce nach der letzten `design`-Mutation. Undo/Redo markiert ebenfalls
  dirty (sonst geht ein Rückgängig beim Reload verloren), aber **ohne** History-Eintrag →
  keine Save↔Undo-Schleife.
- `saveState` speist `save-status-indicator.tsx` („Speichert…" / „Gespeichert" / „Nicht
  gespeichert — erneut versuchen").
- `beforeunload`-Guard bei `dirty`.

---

## 9. Veröffentlichen

1. `publish()` validiert serverseitig gegen `cardDesignPublishSchema`.
2. Kontrast < 3:1 → nur mit `confirmLowContrast: true`, wird in `contrastOverrideBy/At`
   protokolliert.
3. Zählt `IssuedPass` mit `locationId` und `isTest = false` → Anzahl im Dialog:
   „Die Änderungen gelten sofort für **X** ausgegebene Karten."
4. Transaktion: PUBLISHED upsert ← DRAFT-Snapshot, `version = max+1`, `CardDesignVersion`
   anlegen.
5. Wiederherstellen: Snapshot einer Version → DRAFT (nicht direkt PUBLISHED; der Nutzer
   sieht erst die Vorschau und veröffentlicht dann bewusst).

---

## 10. Testkarte — der 20-Sekunden-Pfad

```
Klick "Testkarte aufs Handy"
  -> Server Action createTestCardToken()      ~100 ms  (Snapshot des DRAFT, Token 30 min)
  -> Modal zeigt QR (serverseitig gerendert, DataURL)  sofort
  -> Handy scannt -> GET /p/<token>
       UA iOS      -> 302 /api/test-card/<token>?p=apple   -> .pkpass (Mock, Content-Type
                      application/vnd.apple.pkpass)
       UA Android  -> 302 auf buildGoogleSaveUrl()
       sonst       -> Landing mit beiden Buttons
```

Warmlauf: der Strip für den Snapshot wird **beim Token-Erzeugen** vorgerendert und im Token
gecacht, nicht erst beim Scan. Damit ist der Scan-Pfad reines Zusammenpacken.

Der Token ist bewusst **nicht** authentifiziert — ein fremdes Handy muss ihn öffnen können.
Schutz: 256-bit Zufall, 30 min TTL, `usedCount`-Limit 20, Snapshot statt Live-Zugriff auf die
Location (Token gibt also keinen Lesezugriff auf die DB frei).

E-Mail-Versand: dieselbe `/p/<token>`-URL. Versand nur an die E-Mail des eingeloggten Users
oder an eine im Dialog eingetippte Adresse — **hier warte ich auf Bestätigung**, siehe
**Offene Frage 7**.

`MockPassBuilder`: erzeugt ein echtes ZIP mit `pass.json`, `icon.png`, `logo.png`,
`strip.png` (@1x/@2x/@3x) und `manifest.json` — nur ohne `signature`. Es ist damit kein
gültiger Wallet-Pass, aber byte-für-byte inspizierbar und der spätere echte Builder muss nur
die Signatur ergänzen. QR-Payload: `https://<host>/s/<serial>` (Dummy-Stempel-URL).

---

## 11. Plattform-Matrix (Warnhinweise im Editor)

| Feld | Apple | Google | Hinweis im UI |
|---|---|---|---|
| `backgroundColor` | ✅ `rgb(r,g,b)` | ✅ `hexBackgroundColor` (Hex!) | — |
| `foregroundColor` | ✅ | ❌ (Google leitet ab) | „Nur Apple Wallet" |
| `labelColor` | ✅ | ❌ | „Nur Apple Wallet" |
| Logo | ✅ `logo.png` | ✅ `programLogo` | — |
| Strip/Hero | ✅ `strip.png` 375×123 | ✅ `heroImage` 3:1 | „Unterschiedlicher Zuschnitt" |
| Stempelstand | `headerFields` | `loyaltyPoints` | — |
| Belohnung | `secondaryFields` | `textModulesData` | — |
| Rückseite Text | `backFields` ∞ | `textModulesData` (Anzeige gekürzt) | „Google zeigt weniger" |
| Website/Telefon | `backFields` | `linksModuleData` | — |
| Geo-Push | ✅ max. 10 | ✅ `locations` | — |
| Barcode PDF417/Aztec | ✅ | eingeschränkt | „Nur Apple Wallet" |
| `expiresAt` | ✅ | ✅ | — |
| „teilbar" | `sharingProhibited` | `LoyaltyObject` Redemption | — |

Umsetzung als `platform-support.ts` + `<PlatformSupportBadge field="labelColor" />`.

---

## 12. Sicherheit

- **Mandantentrennung:** `assertLocationAccess(session, locationId)` in *jeder* Server Action
  und in `page.tsx`, vor jedem Prisma-Zugriff. Alle Queries filtern zusätzlich über
  `locationId` (`findFirst({ where: { id, locationId } })`, nie `findUnique({ id })`).
  Nicht gefunden → 404, nicht 403 (keine Existenz-Preisgabe).
- **Uploads:** ≤ 5 MB, Magic Bytes (`89 50 4E 47`, `FF D8 FF`, `<?xml`/`<svg`), nicht die
  Endung. SVG: `svgo` + Allowlist (kein `<script>`, `<foreignObject>`, `<use href=http…>`,
  keine `on*`-Attribute, keine externen Referenzen). Alles danach durch
  `sharp(...).rotate().png()` → EXIF, ICC-Payloads und eingebettete Reste sind weg.
  Rasterausgabe auch für SVG-Uploads (Wallet frisst kein SVG).
- Upload-Endpunkt rate-limited pro Location.
- Kein `dangerouslySetInnerHTML` mit Nutzerinhalten; unser eigenes Strip-SVG entsteht rein
  serverseitig aus validierten Zahlen und `#rrggbb`-Werten.

---

## 13. Tests

| Datei | Inhalt |
|---|---|
| `stamp-layout.test.ts` | rows/cols/cell/icon für N = 3, 5, 6, 10, 12, 20; Zentrierung unvollständiger Reihen (N = 7, 11); Grenzen 3 und 20; Grid passt immer ins Canvas |
| `render-strip.test.ts` | PNG-Header, exakte Dimensionen für alle 3 Scales + Google 1032×336; gleicher Input → identischer Buffer; `currentStamps > stampGoal` wird geklemmt |
| `contrast.test.ts` | bekannte Paare (#000/#fff = 21, #777/#fff ≈ 4.48), Schwellen 3.0/4.5, `autoFix` liefert ≥ 4.5 und bleibt am Ursprungston |
| `card-design-schema.test.ts` | jede Limit-Zeile aus §5, Draft-vs-Publish-Divergenz, 11 Geo-Locations schlagen fehl |
| `apple-pass-json.test.ts` | Feldanzahl-Limits, `rgb()`-Format, `messageEncoding` |
| `images-pipeline.test.ts` | umbenannte `.png` mit JPEG-Bytes, SVG mit `<script>`, 6-MB-Datei |

Ziel ≥ 80 % auf `lib/`. UI-Komponenten: Smoke-Tests für Tabs + Preview-Umschalter.

---

## 14. Etappen

| # | Inhalt | Ergebnis |
|---|---|---|
| 0 | Scaffold: Next 15, TS strict, Tailwind, shadcn, Vitest, Prisma, Seed | `npm run dev` läuft |
| 1 | **Datenmodell**: schema.prisma, Zod, Typen, Templates, Defaults + Schema-Tests | grün |
| 2 | **Renderer**: `stamp-layout`, `stamp-icons`, `strip-svg`, `render-strip`, `/api/preview/strip` + Tests | PNG im Browser sichtbar |
| 3 | **Preview**: Apple-/Google-Nachbau, Front/Back, Hell/Dunkel, Stempel-Slider, Export | Vorschau ohne Editor bedienbar |
| 4 | **Editor-Panels**: Store, 4 Tabs, Kontrast-Warnung, Palette, Upload-Pipeline, Crop | vollständige Bedienung |
| 5 | **Persistenz**: Server Actions, Autosave, Undo/Redo, Publish, Versionen, Vorlagen-Dialog | Zustand überlebt Reload |
| 6 | **Testkarte**: Token, QR, `/p/[token]`, MockPassBuilder, E-Mail | Karte landet im Wallet |

Nach jeder Etappe kurze Zusammenfassung, dann weiter.

---

## 15. Offene Fragen

**Blockierend (bitte vor Etappe 0/1 beantworten):**

1. **Repo wirklich leer?** Es gibt kein Bestandsprojekt unter `stampie`. Soll ich das
   Next-Projekt hier neu aufsetzen — oder liegt das echte Repo woanders und ich habe den
   falschen Ordner? *(Annahme sonst: neu aufsetzen, Auth/Tenancy als Stub.)*

2. **Draft/Published als zwei Zeilen** (mein Vorschlag) oder eine Zeile mit Status-Feld
   (wie im vorgegebenen Schema)? Mit nur einer Zeile lässt sich „Änderungen wirken erst nach
   Veröffentlichen" nicht abbilden. *(Annahme sonst: zwei Zeilen, `@@unique([locationId, status])`.)*

**Nicht blockierend — ich arbeite mit der genannten Annahme weiter, sag Bescheid wenn falsch:**

3. **Stempelstand-Anzeige.** `headerFields` sind sehr schmal; „6/10" passt, „6 von 10
   Stempeln" nicht. Ich nehme `headerFields[0] = { label: stampLabel, value: "6/10" }` und
   `primaryFields: []` wie vorgegeben.

4. **Offene Stempel:** drei Stile (`outline` / `transparent` / `dashed`), wobei
   `transparent` = 25 % Deckkraft. Deckt die in §1 genannten zwei Techniken ab.

5. **Emoji als Stempel-Icon:** über gebündeltes Twemoji-SVG-Set (CC-BY 4.0, Attribution im
   Impressum nötig), nicht über System-Emoji-Font. Falls die Lizenz-Attribution stört,
   lasse ich den Emoji-Picker weg und behalte nur Bibliothek + Upload.

6. **SVG-Sanitizing:** `svgo` + eigene Allowlist statt `dompurify`+`jsdom` (keine
   DOM-Emulation im Server-Bundle). Gerasterte Ausgabe sowieso, das SVG verlässt den Server nie.

7. **Testkarte per E-Mail:** an beliebige eingetippte Adressen versendbar oder nur an die
   E-Mail des eingeloggten Users? Freie Eingabe macht uns zum offenen Mail-Relay
   (Spam-Vektor). *(Annahme: freie Eingabe erlaubt, aber Rate-Limit 5/Stunde/Location und
   Absender-Domain fix.)* Und: welcher Mail-Versender ist vorgesehen (Resend, SES, SMTP)?
   *(Annahme: `MailAdapter`-Interface, Dev-Implementierung schreibt in die Konsole.)*

8. **Gültigkeitsdauer** (Tab 4): absolutes Datum (`expiresAt`, wie im Schema) oder relative
   Laufzeit ab Ausgabe („12 Monate nach Ausstellung")? Für Stempelkarten ist relativ
   üblicher. *(Annahme: absolutes Datum wie vorgegeben, relative Option später.)*

9. **Kontrastprüfung** gegen `labelColor`: der Auftrag nennt nur foreground↔background.
   Labels in `#cccccc` auf hellem Grund sind das häufigere reale Problem.
   *(Annahme: beide Paare werden geprüft; labelColor löst nur die gelbe Warnung aus, blockiert
   nie das Veröffentlichen.)*

10. **`stampGoal` nachträglich ändern** bei bereits ausgegebenen Karten: Kunde hat 8/10, Ziel
    wird auf 6 gesenkt. Klemmen, anteilig umrechnen oder Änderung nach der ersten Ausgabe
    sperren? *(Annahme für diesen Auftrag: beim Veröffentlichen zusätzliche Warnung im
    Dialog, technisch geklemmt — die eigentliche Migration gehört zur Stempel-Logik, die
    nicht in diesem Scope liegt.)*

---

## 16. Abweichungen vom Plan (beim Bauen entschieden)

1. **`lib/signed-query.ts` gestrichen.** Die Vorschau muss *ungespeicherten* Editor-Zustand
   zeigen, also reisen die Renderparameter in der Query — die der Client aber nicht
   signieren kann, weil das Secret serverseitig liegt. Statt HMAC prüft
   `GET /api/preview/strip` jetzt `assertLocationAccess(loc)`. Das ist die schärfere
   Kontrolle: der Aufrufer muss ein eingeloggtes Mitglied des Standorts sein.
   Cache-Buster `v` bleibt (FNV-1a im Client), die Route ignoriert ihn.

2. **Emoji ohne Twemoji-Bundle.** Statt ein SVG-Set mitzuliefern (Lizenz-Attribution,
   ~10 MB) rastert der Browser das gewählte Emoji per Canvas zu einem PNG und lädt es als
   `STAMP_ICON`-Asset hoch — das Gerät, auf das der Nutzer gerade schaut, hat die Fonts.
   `stampIcon` speichert `emoji:<codepoints>` plus `stampIconAssetId`. Das Zod-Schema
   verlangt das Asset jetzt für `custom` **und** für `emoji:` (Offene Frage 5 erledigt).

3. **`lib/images/upload-constraints.ts` neu.** Die Editor-Panels brauchen `MAX_UPLOAD_BYTES`
   und die Zielgrößen für sofortiges Feedback, dürfen aber sharp/svgo nicht ins
   Client-Bundle ziehen. Limits und Typen liegen deshalb getrennt von `pipeline.ts`
   (`server-only`).

4. **Kein Karten-Widget für Geo-Standorte.** Ein zieh­barer Kartenausschnitt braucht einen
   externen Tile-Provider — eine Plattformentscheidung, keine Panel-Entscheidung. Stattdessen:
   numerische Koordinaten, Radius-Slider und „Standort des Betriebs übernehmen" aus den
   Stammdaten, was den real auftretenden Fall abdeckt.

5. **`labelColor` wird geprüft, blockiert aber nie** (wie in Offener Frage 9 angenommen).
   Alle 8 Vorlagen erfüllen ≥ 4.5:1 für beide Paare — dafür gibt es einen Test.

6. **Testabdeckung.** 94.8 % Zeilen auf `src/lib` + `src/stores`. Ausgenommen sind die
   Module, die ohne laufende Infrastruktur nicht ausführbar sind (`repository`,
   `asset-service`, `strip-service`, `test-card-service`, `session`, `db`, S3-Adapter) —
   die Ausschlussliste steht kommentiert in `vitest.config.ts`.

7. **Icons nachgezogen.** Schere, Kaffee, Eis und Döner wurden nach einem Render-Check neu
   gezeichnet (die erste Schere las sich als Insekt, der Döner als Map-Pin).
   `scripts/gen-preview.mts` rendert die ganze Bibliothek durch den echten Renderer.

## 17. Was auf diesem Rechner nicht verifiziert werden konnte

Es ist weder PostgreSQL noch Docker installiert, also lief die App nicht gegen eine echte
Datenbank. Verifiziert wurde: `next build`, `tsc --noEmit`, 278 Unit-/DOM-Tests, ein
Boot-Smoke-Test von `next start` (Server antwortet, `/api/preview/strip` liefert korrekt
400 bei ungültigen Parametern, die Kartenseite streamt das Skeleton und fällt sauber in
`error.tsx` statt in einen weißen Bildschirm).

**Nicht durchlaufen** sind damit die DB-gebundenen Pfade: Autosave, Veröffentlichen,
Versionen, Upload-Persistenz und der komplette Testkarten-Flow Ende-zu-Ende.
`docker-compose.yml` und die vier Befehle in der README bringen das in etwa einer Minute
zum Laufen.
