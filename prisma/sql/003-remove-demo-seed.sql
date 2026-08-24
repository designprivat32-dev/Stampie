-- Entfernt die Demo-Karte aus der Produktionsdatenbank.
--
-- Der Seed lief bisher bei jedem Production-Deploy mit und legte „Kaffeekarte Café Nord"
-- immer wieder an. In einer Übersicht, die einem Betrieb sagen soll, wie viele Karten er
-- führt, ist eine erfundene Karte kein harmloser Platzhalter: sie macht jede Zahl auf der
-- Seite fragwürdig. Der Seed läuft deshalb nur noch lokal (siehe prisma/deploy.mts), und
-- der Altbestand fällt hier.
--
-- Nur die Karte, und nur diese eine mit ihrer festen Seed-ID. Sie hat nie einen Pass
-- ausgegeben; mit ihr geht ihr Entwurfs-Design (ON DELETE CASCADE), sonst nichts.
--
-- Die beiden Demo-Betriebe (Café Nord, Barbier Altona) und die Demo-Nutzer bleiben
-- absichtlich stehen: an ihnen hängt die Anmeldung, solange die Auth noch ein Platzhalter
-- ist. Wer sie loswerden will, muss vorher echte Konten haben.
--
-- Idempotent: nach dem ersten Durchlauf trifft die Anweisung nichts mehr.

DELETE FROM "Card" WHERE "id" = 'ccardcafenord000000000001';
