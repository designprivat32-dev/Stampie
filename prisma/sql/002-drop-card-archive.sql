-- Entfernt das Archiv-Konzept: eine Karte ist da oder sie ist weg.
--
-- Archivieren war ein halber Zustand — im Dashboard „gelöscht", in der Datenbank aber
-- weiter stempelbar, weil nur die Listen sie ausblendeten. Das ist genau der Fall, der an
-- der Kasse „gestempelt!" meldete, ohne dass danach irgendwo etwas zu sehen war. Statt den
-- halben Zustand überall mitzuschleppen, gibt es ihn nicht mehr.
--
-- WAS DIESES SKRIPT UNWIDERRUFLICH LÖSCHT: jede bereits archivierte Karte — und über die
-- Fremdschlüssel (ON DELETE CASCADE) auch deren Designs, Design-Versionen, Bilder,
-- Nachrichten, Testkarten-Token, ausgegebene Pässe, die Wallet-Registrierungen dieser
-- Pässe und die komplette Stempel-Historie dazu. Pässe, die Kunden im Wallet haben, gehen
-- danach ins Leere: Apple bekommt beim Abruf ein 404 und der Pass bleibt auf dem Stand
-- stehen, den das Telefon zuletzt gesehen hat.
--
-- Wer archiviert hat, meinte „weg" — deshalb ist das Löschen hier die Auflösung des
-- Zwischenzustands und keine neue Entscheidung.
--
-- Warum von Hand und nicht über `prisma db push`: das Verwerfen von Daten verlangt dort
-- `--accept-data-loss`. Dieses Flag ins Deploy-Kommando zu schreiben würde jede künftige
-- versehentliche Löschung mit durchwinken. Der eine Schritt, der hier gewollt ist, steht
-- deshalb ausgeschrieben da.
--
-- Idempotent: nach dem ersten Durchlauf gibt es die Spalte nicht mehr, beide Anweisungen
-- sind dann wirkungslos.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Card' AND column_name = 'archivedAt'
  ) THEN
    DELETE FROM "Card" WHERE "archivedAt" IS NOT NULL;
  END IF;
END $$;

DROP INDEX IF EXISTS "Card_orgId_archivedAt_idx";
ALTER TABLE "Card" DROP COLUMN IF EXISTS "archivedAt";
