# Apple Wallet einrichten

Damit iOS eine Stempelkarte annimmt, muss das `.pkpass` signiert sein: eine
PKCS#7-Signatur über `manifest.json`, erzeugt mit einem **Pass Type ID Zertifikat** aus
dem Apple Developer Program. Ohne Signatur lädt Safari die Datei zwar herunter, Wallet
lehnt sie aber ohne Begründung ab.

Der komplette Weg läuft unter Windows — ein Mac wird **nicht** gebraucht. Apple
dokumentiert nur den Keychain-Weg, der Schlüssel ist aber ein gewöhnlicher RSA-Schlüssel
und OpenSSL kann alles, was Keychain Access kann. OpenSSL liegt Git für Windows bei; die
Befehle unten laufen in Git Bash.

Dauer: rund 15 Minuten, davon 10 Minuten Warten auf Apple.

---

## 1. Pass Type ID anlegen

<https://developer.apple.com/account/resources/identifiers/list/passTypeId>

**+** → *Pass Type IDs* → Beschreibung und Identifier eintragen. Der Identifier beginnt
immer mit `pass.` und ist umgekehrte Domainschreibweise:

```
pass.de.stampie.stampcard
```

Er ist dauerhaft und lässt sich nicht umbenennen. Eine Pass Type ID reicht für alle
Karten aller Kunden — die einzelne Karte wird über `serialNumber` unterschieden, nicht
über den Typ.

## 2. Schlüssel und Zertifikatsanfrage erzeugen

```bash
npm run apple:cert -- csr
```

Schreibt nach `apple-certs/` (gitignored):

| Datei | Inhalt |
|---|---|
| `pass.key` | privater Schlüssel — verlässt den Rechner nie |
| `pass.csr` | Zertifikatsanfrage — genau diese Datei bekommt Apple |

## 3. Zertifikat bei Apple ausstellen lassen

<https://developer.apple.com/account/resources/certificates/list>

**+** → *Pass Type ID Certificate* → die Pass Type ID aus Schritt 1 wählen →
`apple-certs/pass.csr` hochladen → **Download**. Apple liefert eine `.cer`-Datei
(meist `pass.cer`).

## 4. Zertifikat und Schlüssel bündeln

```bash
npm run apple:cert -- pack ~/Downloads/pass.cer
```

Erzeugt `apple-certs/pass.p12` und gibt anschließend die fertigen `.env`-Zeilen aus,
inklusive der aus dem Zertifikat gelesenen Team ID und Pass Type ID.

## 5. Umgebung setzen

Ausgabe aus Schritt 4 in `.env` übernehmen:

```
APPLE_PASS_TYPE_ID="pass.de.stampie.stampcard"
APPLE_TEAM_ID="A1B2C3D4E5"
APPLE_PASS_CERTIFICATE_PASSWORD=""
APPLE_PASS_CERTIFICATE="MIIL…"   # base64 der .p12, eine sehr lange Zeile
```

Auf Vercel dieselben vier Werte unter *Settings → Environment Variables* anlegen und
neu deployen. `APPLE_PASS_CERTIFICATE` ist base64, damit es als Umgebungsvariable
transportierbar ist — die `.p12` selbst gehört nicht ins Repository.

Prüfen:

```bash
npm run apple:cert -- check
```

## 6. Auf dem iPhone testen

Dev-Server starten, im Kartendesigner **Testkarte** öffnen. Die Warnung „Apple Wallet
noch nicht eingerichtet" muss verschwunden sein. QR-Code mit der iPhone-Kamera scannen →
*Zu Apple Wallet hinzufügen*.

Für einen lokalen Server muss das iPhone die Seite erreichen können. Entweder
`NEXT_PUBLIC_APP_URL` auf die LAN-IP setzen und diese im WLAN aufrufen, oder gleich gegen
das Vercel-Deployment testen. Der Barcode enthält genau diese URL — steht dort
`localhost`, zeigt die fertige Karte an der Kasse ins Leere.

---

## Wenn Wallet den Pass ablehnt

Wallet nennt nie einen Grund. Die häufigsten Ursachen, alle vom Server geprüft und im
Log als `[apple-wallet] …` ausgegeben:

| Symptom | Ursache |
|---|---|
| Testkarten-Dialog warnt weiter | Zertifikat nicht lesbar — Serverlog lesen, `apple:cert -- check` ausführen |
| „Safari kann die Datei nicht laden" | Pass Type ID oder Team ID passt nicht zum Zertifikat |
| Datei lädt, Wallet öffnet nicht | fehlendes `icon.png` (wird inzwischen immer erzeugt) oder abgelaufenes Zertifikat |
| Vorher funktionierend, jetzt nicht | Zertifikat ist ein Jahr gültig und muss erneuert werden — Schritte 3–5 wiederholen, Schlüssel aus Schritt 2 bleibt |

## Was damit noch nicht geht

Ein neuer Stempel erreicht ein bereits installiertes iPhone-Wallet **nicht** von selbst.
Dafür fehlt der PassKit-Web-Service: `webServiceURL` im Pass, vier Endpunkte für
Registrierung und Abruf sowie APNs-Pushes an registrierte Geräte. Der Kunde muss die
Karte bis dahin neu laden. Google Wallet wird bereits per `PATCH` aktualisiert.

## Kosten und Bedingungen

Apple Developer Program: 99 €/Jahr. Das Zertifikat ist ein Jahr gültig, die Pass Type ID
dauerhaft. Für Wallet-Pässe ist kein App-Store-Review nötig — die Karte muss nirgends
eingereicht werden.
