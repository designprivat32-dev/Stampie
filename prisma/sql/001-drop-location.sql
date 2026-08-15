-- Entfernt das Filial-Konzept (Model `Location`).
--
-- Warum von Hand und nicht über `prisma db push`: das Verwerfen einer Tabelle ist echter
-- Datenverlust, und db push verlangt dafür `--accept-data-loss`. Dieses Flag ins
-- Deploy-Kommando zu schreiben würde jede künftige versehentliche Löschung mit
-- durchwinken. Der eine Schritt, der hier wirklich gewollt ist, steht deshalb ausgeschrieben
-- da — nachlesbar, überprüfbar, auf genau diese zwei Objekte begrenzt.
--
-- Die Stammdaten (Adresse, Öffnungszeiten, Geo, Impressum, Datenschutz) liegen jetzt auf
-- `Organization`. Übernommen wird nichts: es gab nie eine Oberfläche, um eine Filiale
-- anzulegen, also enthält die Tabelle ausschließlich Seed-Daten.
--
-- Idempotent: nach dem ersten Durchlauf sind beide Anweisungen wirkungslos.

ALTER TABLE "Card" DROP COLUMN IF EXISTS "locationId";
DROP TABLE IF EXISTS "Location";
