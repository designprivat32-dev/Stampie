-- Räumt Pässe weg, die nie jemand bekommen hat.
--
-- Die Ausgabe in der Betriebs-App legte bis eben bei jedem Antippen einen `IssuedPass` an
-- und zeigte dessen Statusseite als QR. Die Seite kann keine Karte ins Wallet legen, also
-- blieb jedes Mal eine Zeile zurück, die zu keinem Telefon gehört. In der Übersicht stehen
-- sie als „Karten im Umlauf" — eine Zahl, die einem Betrieb sagen soll, wie viele Kunden
-- er hat, und die deshalb stimmen muss.
--
-- Gelöscht wird nur, was zweifelsfrei nie in Benutzung war:
--   * `kind = 'STAMP'`      — Gutscheine bleiben unangetastet; die haben systembedingt
--                             keinen deviceKey und sind trotzdem echte Ansprüche.
--   * `isTest = false`      — Testkarten haben ihren eigenen Lebenszyklus.
--   * `deviceKey IS NULL`   — nie an ein Telefon ausgeliefert. Wer über `/k/<code>` eine
--                             Karte bekommt, hat immer einen.
--   * `stamps = 0` und keine Stempel-Historie und keine Wallet-Registrierung — sobald eins
--                             davon existiert, hat die Karte gelebt und bleibt.
--
-- Idempotent: beim zweiten Durchlauf trifft die Anweisung nichts mehr. Die Zahl steht im
-- Deploy-Log, damit nachvollziehbar ist, was verschwunden ist.

DO $$
DECLARE
  entfernt INTEGER;
BEGIN
  DELETE FROM "IssuedPass" p
  WHERE p."kind" = 'STAMP'
    AND p."isTest" = false
    AND p."deviceKey" IS NULL
    AND p."stamps" = 0
    AND NOT EXISTS (SELECT 1 FROM "StampEvent" e WHERE e."passId" = p."id")
    AND NOT EXISTS (SELECT 1 FROM "AppleDeviceRegistration" r WHERE r."passId" = p."id");

  GET DIAGNOSTICS entfernt = ROW_COUNT;
  RAISE NOTICE '[004] % nie ausgelieferte Paesse entfernt', entfernt;
END $$;
