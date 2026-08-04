# PLAN — Kartenverwaltung & Rollentrennung

> Umbau von „eine Karte pro Standort" auf „viele Karten, einem Kunden zugewiesen".
> Wird direkt umgesetzt (auf deine Ansage „erstelle einen plan und fahre fort").

---

## 1. Was sich am Modell ändert

Heute hängt das Kartendesign am Standort und ist dort auf **eine** Karte begrenzt:

```
Organization → Location → CardDesign (genau 1 DRAFT + 1 PUBLISHED)
```

Das kollidiert direkt mit „der Kunde kann mehrere Karten haben". Neue Struktur — `Card`
wird die eigenständige Einheit, das Design hängt an der Karte:

```
Organization (= Kunde)
  ├─ Membership (Nutzer + Rolle)
  ├─ Location   (Filialen: Stammdaten, Geo)
  └─ Card       ← beliebig viele
       ├─ CardDesign  (1 DRAFT + 1 PUBLISHED je Karte)
       ├─ IssuedPass
       └─ StampEvent
```

`Card` trägt Name, Zuordnung zum Kunden, optionale Filiale und Status.
Eine Karte **ohne** `orgId` ist eine noch nicht zugewiesene Agentur-Karte — genau der Fall
„angelegt, aber noch keinem Kunden gegeben".

## 2. Rollen

| Rolle | Sieht | Darf gestalten | Darf **stempeln** |
|---|---|---|---|
| `AGENCY` | **alle** Karten aller Kunden | ja | **nein** |
| `OWNER` / `MEMBER` | nur Karten der eigenen Organisation | ja | **ja** |

Die Stempel-Sperre für die Agentur ist eine ausdrückliche Anforderung („nur der Kunde soll
stempeln dürfen") und wird serverseitig in der Action geprüft, nicht nur in der UI.

## 3. Seiten

| Route | Zweck |
|---|---|
| `/dashboard/karten` | **Übersicht aller Karten** mit Vorschaubild, Kunde, Status, Kartenzahl. Plus-Button legt neu an. |
| `/dashboard/karten/[cardId]` | Der bestehende Karten-Designer, jetzt pro Karte |
| `/dashboard/karten/[cardId]/stempeln` | Kassenansicht, nur für Kundenrollen |

`/dashboard/[locationId]/karte` entfällt.

Der Plus-Button legt eine Karte an (Name + optional Kunde) und springt direkt in den
Designer — also genau „erst Übersicht, dann das bestehende Tool".

## 4. Zuweisung

In der Übersicht bekommt jede Karte ein Menü **Kunde zuweisen**: Auswahl aus den
Organisationen, Speichern per Server Action. Eine Karte ohne Kunden wird als *Nicht
zugewiesen* markiert und kann nicht gestempelt werden — es gibt niemanden, der dürfte.

## 5. Migration

`CardDesign.locationId` → `cardId` ist ein Fremdschlüsselwechsel. Für jede vorhandene
Location entsteht eine `Card`, deren Design das bisherige übernimmt. Dasselbe für
`IssuedPass`, `StampEvent`, `TestCardToken`.

**Bruch, der dabei entsteht:** Die Google-Klassen-ID lautet heute `<issuer>.loc_<locationId>`
und wird zu `<issuer>.card_<cardId>`. Bereits gespeicherte Wallet-Karten hängen an der alten
Klasse und werden nicht mehr aktualisiert. Für die Demo bedeutet das: Karte einmal neu
speichern. Für echte Kunden gäbe es das Problem nicht, weil dort noch nichts ausgegeben ist.

## 6. Reihenfolge

1. Schema + Migration + Seed
2. Zugriffsschicht: `assertCardAccess`, Rollenprüfung, `canStamp`
3. Repository und Actions von `locationId` auf `cardId`
4. Übersichtsseite mit Plus-Button und Zuweisung
5. Designer und Kassenansicht umhängen
6. Wallet-Routen (`logo`, `hero`) auf `cardId`
7. Tests

## 7. Offene Punkte

- **Auth ist weiterhin ein Stub.** Die Rollenlogik ist echt und serverseitig geprüft, aber
  `getSession()` löst weiterhin stur `DEV_SESSION_USER_EMAIL` auf. Zum Ausprobieren der
  Kundensicht wird ein Rollenumschalter im Seed gebraucht, kein echter Login.
- **Filiale pro Karte** bleibt optional. Geo-Benachrichtigungen hängen weiter an den
  Koordinaten im Design, nicht an der Filiale.
