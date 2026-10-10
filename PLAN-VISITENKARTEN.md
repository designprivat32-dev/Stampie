# PLAN — Digitale Visitenkarte im Wallet

> Dritte Kartenart neben Stempelkarte und Gutschein. Noch nicht umgesetzt — erst Plan, dann Freigabe.
>
> Festgelegt (Rückfragen beantwortet):
> 1. Karten legt **nur das Dashboard** an (Agentur). Keine Selbstregistrierung, keine Einzelpersonen-Accounts.
> 2. **Firmen mit vielen Mitarbeitern:** eine Karte = Firmendesign, darunter beliebig viele Personen mit je
>    eigenem QR-Code. **Nichts, was heute läuft, darf kaputtgehen** — siehe Abschnitt 8.
> 3. Empfänger-Pass hat **keinen** QR-Code (kein Weitergeben).
> 4. Scan-Seite bietet zusätzlich **„Kontakt speichern“** (.vcf) an.

---

## 1. Ablauf

```
Agentur (Dashboard)                       Mitarbeiter (Aussteller)           Empfänger
───────────────────                       ────────────────────────           ─────────
1. neue Karte, Art „Visitenkarte“,
   Firmendesign + Firmendaten
2. Personen anlegen (Name, Position,
   Tel., Mail, Foto) — je Person
   ein eigener Code
3. Link „Karte ins Wallet“ an die  ───►  4. öffnet Link auf eigenem Handy
   Person schicken                          → Aussteller-Pass MIT QR-Code
                                          5. zeigt Pass vor  ──────────────►  6. scannt mit Kamera (keine App)
                                                                              7. Seite /v/<code>:
                                                                                 [ Zu Apple Wallet ] / [ Zu Google Wallet ]
                                                                                 [ Kontakt speichern ]
                                                                              8. Visitenkarte DAUERHAFT im Wallet,
                                                                                 nur Infos, kein QR, Links antippbar
9. Nummer der Person ändern ───────────────────────────────────────────────►  10. aktualisiert sich bei allen von selbst
```

Zwei Pässe je Person:

| Pass | Wer | Inhalt |
|---|---|---|
| **Aussteller-Pass** | die Person selbst | Kontaktdaten + **QR-Code** → `/v/<code>` |
| **Empfänger-Pass** | jeder, der gescannt hat | dieselben Kontaktdaten, **ohne QR** |

Der QR enthält einen **Link**, keine vCard: nur über eine Webseite lässt sich ein Pass ins Wallet legen.

## 2. Was wiederverwendet wird

| Vorhanden | Nutzung |
|---|---|
| `Card` + `CardDesign` (Entwurf/Veröffentlicht) | Firmendesign der Visitenkarte |
| `IssuedPass` | ein Pass je Aussteller und je Empfänger |
| `handout-service.ts`, `/k/[code]` | **Vorlage** für `/v/[code]` — wird kopiert/abgeleitet, nicht umgebaut |
| `deviceKey` + Wiedererkennungs-Einwilligung | zweiter Scan desselben Handys → derselbe Pass |
| `claimToken` (Gutschein) | einmaliger Link „Karte ins Wallet“ für den Aussteller |
| PassKit Web-Service, `google-sync.ts`, `pass-rebuild.ts` | Updates an alle Pässe |
| Rate-Limit, Asset-Speicher, Bild-Rendering | Foto, Logo |

## 3. Datenmodell

Alles **additiv**: neue Tabellen, neue Spalten nur nullable oder mit Default, neuer Enum-Wert. `prisma db push`
kommt ohne `--accept-data-loss` durch, kein `PRE_PUSH_SQL` nötig.

```prisma
enum CardKind {
  STAMP
  COUPON
  BUSINESS_CARD                 // neu
}

/// Firmendaten einer Visitenkarte — gelten für alle Personen darunter. 1:1 zur Card.
model BusinessCardCompany {
  cardId     String  @id
  card       Card    @relation(fields: [cardId], references: [id], onDelete: Cascade)
  company    String
  website    String?
  phone      String?            // Zentrale
  street     String?
  postalCode String?
  city       String?
  updatedAt  DateTime @updatedAt
}

/// Eine Person auf einer Visitenkarte. Jede hat ihren eigenen Scan-Code.
model BusinessContact {
  id         String  @id @default(cuid())
  cardId     String
  card       Card    @relation(fields: [cardId], references: [id], onDelete: Cascade)
  firstName  String
  lastName   String
  jobTitle   String?
  phone      String?
  mobile     String?
  email      String?
  photoAssetId String?
  links      Json     @default("[]")   // [{ label, url }]
  /// Code hinter /v/<scanCode> und dem QR auf dem Aussteller-Pass. 16 Zufallsbytes,
  /// indexiert statt @unique (gleicher Grund wie Card.nfcCode).
  scanCode   String
  /// Einmal-Link, mit dem die Person ihren Aussteller-Pass holt.
  ownerClaimToken String?
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  passes     IssuedPass[]
  events     BusinessCardEvent[]

  @@index([cardId])
  @@index([scanCode])
  @@index([ownerClaimToken])
}

enum PassRole {
  HOLDER        // Default: alles Bestehende + Empfänger einer Visitenkarte
  OWNER         // Aussteller-Pass (mit QR)
}

model IssuedPass {
  // … unverändert
  role      PassRole          @default(HOLDER)   // neu
  contactId String?                             // neu, nur bei Visitenkarten
  contact   BusinessContact?  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  @@index([contactId])
}

/// Statistik — eigene Tabelle, damit die Stempel-Auswertung (StampEvent) unberührt bleibt.
enum BusinessCardEventKind { VIEWED  WALLET_ADDED  CONTACT_SAVED }
model BusinessCardEvent {
  id        String   @id @default(cuid())
  contactId String
  contact   BusinessContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  kind      BusinessCardEventKind
  platform  String?  // apple | google | other
  createdAt DateTime @default(now())
  @@index([contactId, kind])
}
```

Bestehende Zeilen bekommen `role = HOLDER`, `contactId = null` — verhalten sich exakt wie heute.

## 4. Wallet-Pässe

### Apple (`generic`-Stil, eigene Datei — `apple-pass-json.ts` bleibt unangetastet)
- **Vorne:** Name (primary), Position · Firma (secondary), Telefon/Mail (auxiliary), Foto als `thumbnail`, Logo.
- **Rückseite:** Telefon, Mobil, Mail, Web, Adresse, Links — antippbar.
- **OWNER:** `barcodes: [{ format: PKBarcodeFormatQR, message: "<APP_URL>/v/<scanCode>" }]` + Hinweis
  „Scannen, um meine Visitenkarte zu speichern“.
- **HOLDER:** kein `barcodes`.
- `webServiceURL` + `authenticationToken` wie bisher → Push-Updates.

### Google (`GenericClass` je Karte, `GenericObject` je Pass)
- Header = Name, Subheader = Position · Firma, `textModulesData`, `linksModuleData`, Logo/Foto.
- OWNER mit `barcode` (QR), HOLDER ohne.
- Generic Pass beim bestehenden Issuer-Konto prüfen, bevor Phase 4 startet.

### Neue Dateien
- `src/lib/business-cards/apple-pass-json.ts`
- `src/lib/business-cards/google-generic.ts`
- `src/lib/business-cards/vcard.ts` (vCard 3.0, Escaping, Foto optional base64)
- `src/lib/business-cards/contact-service.ts` (Anlegen, Ändern, Code, Claim)
- `src/lib/business-cards/issue-service.ts` (Pass ausstellen OWNER/HOLDER, Wiedererkennung)
- `src/lib/business-cards/schema.ts` (Zod)

Eigener Ordner `business-cards/` statt Erweiterung von `lib/cards/` → bestehende Dateien bleiben klein und unberührt.

## 5. Scan-Seite `/v/[code]`

Öffentlich, ohne Login, mobil zuerst.

1. `scanCode` → `BusinessContact` → Karte (nur veröffentlichtes Design, nur `BUSINESS_CARD`), sonst 404.
2. Vorschau: Foto, Name, Position, Firma.
3. Buttons (vorhandene Plattform-Erkennung):
   - iPhone: **Zu Apple Wallet hinzufügen** → HOLDER-Pass, `.pkpass`
   - Android: **Zu Google Wallet hinzufügen** → Save-Link
   - immer: **Kontakt speichern** → `.vcf`
4. Wiedererkennung per `deviceKey` (nur mit Einwilligung): erneuter Scan → selber Pass.
5. `/v/[code]/datenschutz` analog `/k/[code]/datenschutz`.
6. Rate-Limit auf Ausstellen und vCard.

Owner-Claim: `/v/claim/[token]` → OWNER-Pass ausstellen; Token wird danach ungültig, neuer Link im Dashboard erzeugbar.

APIs: `src/app/api/v/[code]/{apple,google,vcard}/route.ts`, `src/app/api/v/claim/[token]/route.ts`.

## 6. Dashboard

- **Neue Karte:** Auswahl um *Visitenkarte* erweitert.
- **Designer** bei `BUSINESS_CARD`:
  - Reiter *Design* (Farben, Logo) — bestehend
  - Reiter *Firmendaten* — neu
  - Reiter *Personen* — neu: Liste, anlegen/bearbeiten/löschen, je Person: „Wallet-Link erzeugen“ (kopieren/QR),
    „Code neu erzeugen“, Statistik
  - Stempel-/Gutschein-Reiter ausgeblendet
  - Vorschau: Aussteller- und Empfänger-Ansicht, Apple/Google, mit Beispielperson
- **Kartenübersicht:** Visitenkarten mit eigenem Badge und Personenanzahl statt Stempelzahl.

## 7. Aktualisierung

- Firmendaten oder Design geändert → Rebuild aller Pässe der Karte.
- Person geändert → Rebuild nur ihrer Pässe (OWNER + HOLDER).
- Stilles Update ohne `changeMessage` (keine Benachrichtigung bei Nummernänderung).
- Person gelöscht → Pässe: Apple-Update mit Hinweis „nicht mehr gültig“, Google `state: INACTIVE`, dann Zeilen
  löschen. Gleiches beim Löschen der ganzen Karte.

## 8. Nichts kaputtmachen — Schutzmaßnahmen

Heute prüfen etwa 20 Stellen `kind === 'COUPON'` und behandeln **alles andere als Stempelkarte**. Ein neuer
Wert `BUSINESS_CARD` würde dort still als Stempelkarte durchlaufen. Deshalb:

1. **Alle Weichen explizit machen** — vor jeder anderen Änderung, als eigener Commit:
   `src/actions/cards.ts`, `actions/messages.ts`, `actions/stamping.ts`, `api/wallet/logo`, `k/[code]/page.tsx`,
   `lib/cards/apple-pass-json.ts`, `handout-service.ts`, `schema.ts`, `pass/google-pass-builder.ts`,
   `wallet/google-sync.ts`, Dashboard-Komponenten unter `karten/[cardId]`, `new-card-dialog.tsx`.
   Visitenkarten werden dort **abgelehnt bzw. umgeleitet**, nie als Stempelkarte behandelt.
2. **Serverseitige Sperren:** Stempeln, Gutschein-Einlösen, NFC-Ausgabe `/k`, Nachrichten/Erinnerungen,
   App-API (`/api/app/*`) lehnen `BUSINESS_CARD` ab.
3. **Getrennte Wege:** Visitenkarten laufen über `/v` und `lib/business-cards/`. `/k`, `/s`, `/p`, `/g` und
   die Stempel-Logik werden nicht umgebaut.
4. **Schema nur additiv** (Abschnitt 3); Defaults sorgen dafür, dass bestehende Pässe unverändert bleiben.
5. **Regressionstests zuerst:** bestehende Suite muss grün bleiben; neue Tests sichern ab, dass
   Stempelkarte/Gutschein-Pass-JSON und Google-Objekte byte-gleich zu vorher sind (Snapshot vor dem Umbau).
6. **Deploy-Reihenfolge:** Schema-Push passiert nur im Production-Build (`prisma/deploy.mts`). Neue Enum-Werte
   tauchen erst in Zeilen auf, nachdem der neue Code live ist — alter Code sieht sie nie.
7. **Feature erst sichtbar am Ende:** Auswahl „Visitenkarte“ im Neue-Karte-Dialog erst in der letzten Phase
   freischalten. Bis dahin kann nichts davon versehentlich angelegt werden.

## 9. Umsetzungsreihenfolge

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 0 ✅ | Snapshot-Tests für bestehende Pässe, `kind`-Weichen explizit machen (Abschnitt 8.1/8.2) | Absicherung, kein sichtbarer Unterschied |
| 1 ✅ | Schema additiv, `lib/business-cards/schema.ts`, `vcard.ts` + Tests | Daten stehen |
| 2 ✅ | Apple-`generic`-Pass OWNER/HOLDER + Tests | Pass auf iPhone testbar |
| 3 | `/v/[code]`, Claim-Link, Apple-Ausgabe, vCard, Statistik-Events | **Ablauf läuft auf iPhone** |
| 4 | Google Generic Pass + Ausgabe | Android läuft |
| 5 | Dashboard: Firmendaten, Personen, Vorschau, Wallet-Link | selbst bedienbar |
| 6 | Updates/Löschen an alle Pässe, Statistik im Dashboard | fertig |
| 7 | Datenschutztext, Rate-Limits, Review, „Visitenkarte“ im Dialog freischalten | live |

Jede Phase: `npm run typecheck`, `npm test`, nach `main` mergen, auf Vercel-Production prüfen (Stempelkarte
und Gutschein jedes Mal mit testen).

### Stand Phase 0

- `src/lib/cards/kind.ts`: `isLoyaltyKind`, `loyaltyCardWhere()`, `loyaltyPassWhere()`. `CARD_KINDS` bleibt
  bei STAMP/COUPON, auch wenn das Prisma-Enum wächst — dadurch meldet der Typecheck in Phase 1 jede Stelle,
  an der ein Datenbankwert ungeprüft in den Stempel-/Gutschein-Code fließt.
- Eingegrenzt: Stempeln/Einlösen (Dashboard + App), Kassenseite, `/s/<serial>`, Ausgabe `/k` und
  Ausgabe-Dialog, App-Kartenliste/Statistik/Erinnerungen/Ausgabe, Nachrichten, Erinnerungen, Testkarten,
  Pass-Neubau für Apple-Updates (muss in Phase 2 um den Visitenkarten-Zweig ergänzt werden).
- `tests/card-kind-guard.test.ts`: Snapshots der heutigen Apple-/Google-Pässe für Stempelkarte und Gutschein.

### Stand Phase 1

- Schema additiv: `CardKind.BUSINESS_CARD`, `PassRole`, `IssuedPass.role/contactId`, `BusinessCardCompany`,
  `BusinessContact`, `BusinessCardEvent`. Kein Feld entfernt oder umbenannt.
- Typecheck hat genau die erwarteten 8 Stellen gemeldet, an denen der Datenbankwert in Stempel-/Gutschein-Code
  floss; dort steht jetzt `assertLoyaltyKind` hinter einer gefilterten Abfrage. Designer-Seite zeigt für eine
  Visitenkarte vorerst 404 (eigener Designer in Phase 5), `cardKind()` wirft (Veröffentlichen in Phase 5).
- `src/lib/business-cards/schema.ts` (Zod, Normalisierung, nur http/https-Links) und `vcard.ts`
  (vCard 3.0, Escaping, Faltung nach UTF-8-Bytes), Tests in `tests/business-card-vcard.test.ts`.
- Kontaktfoto: `photoAssetId` ist vorbereitet, Upload und `AssetKind` folgen in Phase 5.

### Stand Phase 2

- `lib/business-cards/apple-pass-json.ts`: pass.json im Stil `generic`. Aussteller (OWNER) mit QR auf
  `/v/<scanCode>`, Empfänger (HOLDER) ohne jeden Barcode. Weitergabe aus Wallet für beide gesperrt.
- `lib/business-cards/apple-pass-builder.ts`: .pkpass mit Icon (Monogramm-Fallback), Logo, Foto als
  `thumbnail.png`, Manifest, Signatur. Der Stempel-Builder ist unverändert.
- Seriennummern `V-…`; `rebuildIssuedPass` gibt sie an `lib/business-cards/pass-rebuild.ts` weiter, damit
  Apples Update-Abruf auch für Visitenkarten funktioniert.
- Auf dem iPhone testbar erst mit Phase 3 — vorher stellt nichts einen Visitenkarten-Pass aus.

## 10. Datenschutz

- Daten der Mitarbeiter werden bewusst veröffentlicht — Hinweis im Personen-Formular, Einverständnis der Person
  liegt beim Kunden (Firma).
- Empfänger: keine Personendaten, nur Seriennummer + optional `deviceKey` (§ 25 TDDDG, vorhandene Einwilligung).
- Keine Nachrichten an Empfänger von Visitenkarten (Nachrichten-Funktion sperrt `BUSINESS_CARD`).
- Datenschutzerklärung um Abschnitt „Digitale Visitenkarte“ ergänzen.
